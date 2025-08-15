// VoicePage.js
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { QRCodeCanvas } from "qrcode.react";
import "./VoicePage.css";

function VoicePage({ empNum, isAdmin, onBack }) {
  const { audioName } = useParams();
  const navigate = useNavigate();
  const [audios, setAudios] = useState([]);
  const [listened, setListened] = useState({});
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [progress, setProgress] = useState({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [showQR, setShowQR] = useState({});
  const audioRefs = useRef({});

  useEffect(() => {
    fetchAudios();
    fetchListened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tryAutoPlay = () => {
      if (!audioName || audios.length === 0) return;
      const matchingAudio = audios.find(
        (a) => a.name.replace(/\.[^/.]+$/, "") === audioName
      );
      const isCompleted =
        matchingAudio && listened[matchingAudio.name]?.completed;
      const audioEl = matchingAudio && audioRefs.current[matchingAudio.name];

      if (matchingAudio && audioEl && !isCompleted) {
        audioEl.play().catch(() => {
          const resumeOnInteraction = () => {
            audioEl
              .play()
              .finally(() => {
                window.removeEventListener("click", resumeOnInteraction);
                window.removeEventListener("keydown", resumeOnInteraction);
              })
              .catch(() => {});
          };
          window.addEventListener("click", resumeOnInteraction);
          window.addEventListener("keydown", resumeOnInteraction);
        });
      }
    };

    tryAutoPlay();
  }, [audios, audioName, listened]);

  const fetchAudios = async () => {
    const { data, error } = await supabase.storage
      .from("voice-audios")
      .list("", {
        limit: 100,
        sortBy: { column: "name", order: "asc" },
      });
    if (!error && data) {
      const urls = await Promise.all(
        data.map(async (file) => {
          const { data: publicUrlData } = supabase.storage
            .from("voice-audios")
            .getPublicUrl(file.name);
          return { name: file.name, url: publicUrlData.publicUrl };
        })
      );
      const filtered = audioName
        ? urls.filter(
            (file) => file.name.replace(/\.[^/.]+$/, "") === audioName
          )
        : urls;
      setAudios(filtered);
      setNotFound(Boolean(audioName && filtered.length === 0));
    }
  };

  const fetchListened = async () => {
    if (!empNum) {
      // No DB records to fetch; leave listened empty so UI will rely on live session state.
      return;
    }
    const { data, error } = await supabase
      .from("audio_progress")
      .select("audio_name, duration, completed")
      .eq("emp_num", empNum);

    if (!error && data) {
      const map = {};
      data.forEach((entry) => {
        map[entry.audio_name] = entry;
      });
      setListened(map);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus("");

    const formData = new FormData();
    formData.append("file", selectedFile);

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      "https://epdnvsarvkucabnntbws.supabase.co/functions/v1/upload-audio"
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        setUploadStatus("✅ Upload successful!");
        fetchAudios();
        setSelectedFile(null);
      } else {
        setUploadStatus("❌ Upload failed: " + xhr.responseText);
      }
      setUploading(false);
    };

    xhr.onerror = () => {
      setUploadStatus("❌ Upload error");
      setUploading(false);
    };

    xhr.send(formData);
  };

  const handleDelete = async (fileName) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${fileName}?`
    );
    if (!confirmed) return;
    const { error } = await supabase.storage
      .from("voice-audios")
      .remove([fileName]);
    if (!error) {
      fetchAudios();
    }
  };

  // Option B: Commit progress using playback time; no event add/remove.
  const commitProgress = async (audio, el, forceComplete = false) => {
    if (!el) return;

    const total = Number(el.duration) || 0;
    const current = Number(el.currentTime) || 0;
    const listenedSeconds = Math.floor(current);
    const isCompleted =
      forceComplete || (total ? current / total >= 0.95 : false);

    // Update UI immediately (even if empNum missing)
    setListened((prev) => ({
      ...prev,
      [audio.name]: {
        ...(prev[audio.name] || {}),
        duration: listenedSeconds,
        completed: isCompleted,
      },
    }));

    // Only write to DB when we have a valid empNum
    if (!empNum) return;

    const { data: existing, error:findErr } = await supabase
      .from("audio_progress")
      .select("id")
      .eq("emp_num", empNum)
      .eq("audio_name", audio.name)
      .maybeSingle();

      if (findErr) {
        console.error("find error", findErr);
        return;
    }

    if (existing) {
      const { data: updated, error: updErr } = await supabase
        .from("audio_progress")
        .update({ duration: listenedSeconds, completed: isCompleted })
        .eq("id", existing.id) // ✅ update by id (exact row)
        .select(); // ✅ returns updated row(s)

        if (updErr) console.error("update error", updErr);
        else console.log("updated", updated);
    } 
    else {
      const { data: inserted, error: insErr } = await supabase
        .from("audio_progress")
        .insert({
        emp_num: empNum,
        audio_name: audio.name,
        duration: listenedSeconds,
        completed: isCompleted,
        })
        .select(); // ✅ returns inserted row

        if (insErr) console.error("insert error", insErr);
        else console.log("inserted", inserted);
    }
  };

  const updateProgress = (audioName, current, total) => {
    setProgress((prev) => ({
      ...prev,
      [audioName]: {
        percent: total ? (current / total) * 100 : 0,
        current,
        total,
      },
    }));
  };

  const handleBack = () => {
    if (onBack) return onBack();
    if (audioName) navigate("/audioPage");
    else navigate("/");
  };

  const toggleQR = (audio) => {
    setShowQR((prev) => ({
      ...prev,
      [audio.name]: !prev[audio.name],
    }));
  };

  return (
    <div className="voice-page">
      <div className="voice-header">
        <h2>🎧 收听音频</h2>
        <button onClick={handleBack}>🔙 返回</button>
      </div>

      {notFound ? (
        <div style={{ padding: "1rem", color: "red" }}>
          ❌ No audio found with the name "{audioName}".
          <br />
          <button onClick={() => navigate("/audioPage")}>返回</button>
        </div>
      ) : (
        <>
          {isAdmin && (
            <div className="upload-section">
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />

              <button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
              >
                {uploading ? `上传中 (${uploadProgress}%)...` : "上传音频"}
              </button>

              {uploading && (
                <div
                  className="upload-progress-bar"
                  style={{ marginTop: "10px" }}
                >
                  <div
                    className="upload-progress-fill"
                    style={{
                      width: `${uploadProgress}%`,
                      height: "8px",
                      backgroundColor: "#4caf50",
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              )}

              {uploadStatus && (
                <div className="upload-status">{uploadStatus}</div>
              )}
            </div>
          )}

          <div className="audio-list">
            {audios.map((audio) => {
              const listenedEntry = listened[audio.name];
              const listenedClass = listenedEntry?.completed ? "listened" : "";
              const p = progress[audio.name] || {};
              const cleanName = audio.name.replace(/\.[^/.]+$/, "");
              const qrUrl = `${window.location.origin}/#/audioPage/${cleanName}`;

              return (
                <div
                  key={audio.name}
                  className={`audio-item ${listenedClass}`}
                >
                  <strong>{audio.name}</strong>

                  <audio
                    controls
                    ref={(el) => (audioRefs.current[audio.name] = el)}
                    onTimeUpdate={(e) =>
                      updateProgress(
                        audio.name,
                        e.target.currentTime,
                        e.target.duration
                      )
                    }
                    onPause={(e) => commitProgress(audio, e.target)}
                    onEnded={(e) => commitProgress(audio, e.target, true)}
                  >
                    {/* omit type to avoid mismatches across mp3/mp4/ogg */}
                    <source src={audio.url} />
                  </audio>

                  <div className="progress-bar-container">
                    <div
                      className="progress-bar"
                      style={{ width: `${p.percent || 0}%` }}
                    />
                  </div>

                  {listenedEntry?.completed && <div>✅ 完成了</div>}
                  {!listenedEntry?.completed &&
                    listenedEntry?.duration > 0 && (
                      <div>
                        ⏱️已听<b>{listenedEntry.duration}</b>秒
                      </div>
                    )}

                  {isAdmin && (
                    <>
                      <button
                        className="delete-button"
                        onClick={() => handleDelete(audio.name)}
                      >
                        🗑️ 删除
                      </button>
                      <button
                        className="qrCode-button"
                        onClick={() => toggleQR(audio)}
                      >
                        📷 创建二维码
                      </button>
                      {showQR[audio.name] && (
                        <div style={{ marginTop: "10px" }}>
                          <QRCodeCanvas value={qrUrl} size={128} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default VoicePage;