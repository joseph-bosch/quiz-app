// VoicePage.js
import React, { useEffect, useState, useRef } from "react";
import { supabase } from './supabaseClient';
import "./VoicePage.css";

function VoicePage({ empNum, isAdmin, onBack }) {
  const [audios, setAudios] = useState([]);
  const [listened, setListened] = useState({});
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [progress, setProgress] = useState({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");

  useEffect(() => {
    fetchAudios();
    fetchListened();
  }, [refreshTrigger]);

  const fetchAudios = async () => {
    const { data, error } = await supabase.storage.from("voice-audios").list("", {
      limit: 100,
      sortBy: { column: "name", order: "asc" },
    });
    if (!error) {
      const urls = await Promise.all(
        data.map(async (file) => {
          const { data: publicUrlData } = supabase.storage.from("voice-audios").getPublicUrl(file.name);
          return { name: file.name, url: publicUrlData.publicUrl };
        })
      );
      setAudios(urls);
    }
  };

  const fetchListened = async () => {
    const { data, error } = await supabase
      .from("audio_progress")
      .select("audio_name, duration, completed")
      .eq("emp_num", empNum);
    if (!error) {
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
    xhr.open("POST", "https://epdnvsarvkucabnntbws.supabase.co/functions/v1/upload-audio");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        setUploadStatus("✅ Upload successful!");
        setRefreshTrigger((prev) => prev + 1);
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
    const confirmed = window.confirm(`Are you sure you want to delete ${fileName}?`);
    if (!confirmed) return;
    const { error } = await supabase.storage.from("voice-audios").remove([fileName]);
    if (!error) {
      setRefreshTrigger((x) => x + 1);
    }
  };

  const handleListen = async (audio, audioElement) => {
    let listenStart = Date.now();

    const handleEndedOrPaused = async () => {
      const listenEnd = Date.now();
      const listenedSeconds = Math.floor((listenEnd - listenStart) / 1000);
      const totalDuration = audioElement.duration;
      const isCompleted = listenedSeconds >= totalDuration * 0.95;

      const { data: existing } = await supabase
        .from("audio_progress")
        .select("id")
        .eq("emp_num", empNum)
        .eq("audio_name", audio.name)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("audio_progress")
          .update({ duration: listenedSeconds, completed: isCompleted })
          .eq("id", existing.id);
      } else {
        await supabase.from("audio_progress").insert({
          emp_num: empNum,
          audio_name: audio.name,
          duration: listenedSeconds,
          completed: isCompleted,
        });
      }
      setRefreshTrigger((x) => x + 1);

      audioElement.removeEventListener("pause", handleEndedOrPaused);
      audioElement.removeEventListener("ended", handleEndedOrPaused);
    };

    audioElement.addEventListener("pause", handleEndedOrPaused);
    audioElement.addEventListener("ended", handleEndedOrPaused);
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

  return (
    <div className="voice-page">
      <div className="voice-header">
        <h2>🎧 Audio Learning</h2>
        <button onClick={onBack}>🔙 Back</button>
      </div>

      {isAdmin && (
        <div className="upload-section">
          <input type="file" onChange={(e) => setSelectedFile(e.target.files[0])} />

          <button onClick={handleUpload} disabled={uploading || !selectedFile}>
            {uploading ? `Uploading (${uploadProgress}%)...` : "Upload Audio"}
          </button>

          {/* Move this to a new line */}
          {uploading && (
            <div className="upload-progress-bar" style={{ marginTop: "10px" }}>
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

          {uploadStatus && <div className="upload-status">{uploadStatus}</div>}
        </div>
      )}


      <div className="audio-list">
        {audios.map((audio) => {
          const listenedEntry = listened[audio.name];
          const listenedClass = listenedEntry?.completed ? "listened" : "";
          const p = progress[audio.name] || {};

          return (
            <div key={audio.name} className={`audio-item ${listenedClass}`}>
              <strong>{audio.name}</strong>
              <audio
                controls
                onPlay={(e) => handleListen(audio, e.target)}
                onTimeUpdate={(e) => updateProgress(audio.name, e.target.currentTime, e.target.duration)}
              >
                <source src={audio.url} type="audio/mpeg" />
              </audio>

              <div className="progress-details">
                {/* <div>{p.current ? `${Math.floor(p.current)}s` : "0s"} / {p.total ? `${Math.floor(p.total)}s` : "--"}</div> */}
                <div>{p.total ? `${Math.floor(p.total - p.current)}s left` : ""}</div>
              </div>

              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${p.percent || 0}%` }}></div>
              </div>

              {isAdmin && (
                <button className="delete-button" onClick={() => handleDelete(audio.name)}>
                  🗑️ Delete
                </button>
              )}
              {listenedEntry?.completed && <div>✅ Completed</div>}
              {!listenedEntry?.completed && listenedEntry?.duration > 0 && (
                <div>⏱️ Listened {listenedEntry.duration}s</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VoicePage;