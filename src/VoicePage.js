// VoicePage.js
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Select from "react-select";
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
  const [userPaused, setUserPaused] = useState(false);
  const audioRefs = useRef({});

  // ✅ User info modal states
  const [employeeNo, setEmployeeNo] = useState(
    localStorage.getItem("employeeNo") || ""
  );
  const [department, setDepartment] = useState(
    localStorage.getItem("department") || ""
  );
  const [name, setName] = useState(localStorage.getItem("name") || "");
  const [employeeError, setEmployeeError] = useState("");
  const [showModal, setShowModal] = useState(!localStorage.getItem("employeeNo"));

  const effectiveEmpNum = empNum || employeeNo;

  const departments = [
    "BD/SLP-CO2", "C/TXR-CN-D4", "GR/FCM-Shz", "GS/OBR23-APAC17", "GS/OSD4-APAC16",
    "GS/PSD5-AP", "MA/HRL-Shz", "MA-WS/PAS-EAA-CN", "MA-WS/PAW-ENG1-CN", "MA-WS/PAW-ENG2-CN",
    "MA-WS/PAW-ENG3-CN", "MA-WS/PAW-ENG-CN", "MA-WS/PUQ1-Shz", "MA-WS/PUQ2-Shz", "MA-WS/PUQ-Shz",
    "MA-WS/PUR2", "ShzP/COR", "ShzP/CTG", "ShzP/HSE", "ShzP/LOG", "ShzP/LOP", "ShzP/LOW", "ShzP/LOW1",
    "ShzP/LOW2", "ShzP/MFE", "ShzP/MFI", "ShzP/MFO1", "ShzP/MFO11", "ShzP/MFO12", "ShzP/MFO13",
    "ShzP/MFO2", "ShzP/MFO21", "ShzP/MFO22", "ShzP/MFO23", "ShzP/MFO24", "ShzP/MFO3", "ShzP/MFO31",
    "ShzP/MFO32", "ShzP/MFO33", "ShzP/MFO4", "ShzP/MFO5", "ShzP/MFO51", "ShzP/MFO52", "ShzP/MFO53",
    "ShzP/MOE", "ShzP/PM", "ShzP/QMM", "ShzP/QMM1", "ShzP/QMM2", "ShzP/QMM6", "ShzP/TEF", "ShzP/TEF1",
    "ShzP/TEF2"
  ].map((dept) => ({ value: dept, label: dept }));

  // Anti fast-forward state
  const maxPlayedRef = useRef({});
  const ignoreSeekRef = useRef({});
  const userSeekingRef = useRef({});

  useEffect(() => {
    fetchAudios();
    fetchListened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showModal) return; // ❌ Do nothing while modal is visible

    const tryAutoPlay = () => {
      if (!audioName || audios.length === 0) return;
      const matchingAudio = audios.find(
        (a) => a.name.replace(/\.[^/.]+$/, "") === audioName
      );
      if (!matchingAudio) return;

      const audioEl = audioRefs.current[matchingAudio.name];
      const isCompleted = listened[matchingAudio.name]?.completed;

      if (!audioEl || isCompleted) return;

      const attemptPlay = () => {
        if (!userPaused) {
          audioEl.play().catch(() => {
            const resumeOnInteraction = () => {
              if (!userPaused) {        // 🚨 only resume if user didn’t manually pause
                audioEl.play()
                  .finally(() => {
                    window.removeEventListener("click", resumeOnInteraction);
                    window.removeEventListener("keydown", resumeOnInteraction);
                  })
                  .catch(() => {});
              }
            };
            window.addEventListener("click", resumeOnInteraction);
            window.addEventListener("keydown", resumeOnInteraction);
          });
        }

      };

      // Slight delay to ensure modal fade-out completed
      setTimeout(attemptPlay, 300);
    };

    tryAutoPlay();
  }, [showModal, audios, audioName, listened]);


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
    if (!effectiveEmpNum) return;
    const { data, error } = await supabase
      .from("audio_progress")
      .select("audio_name, duration, completed")
      .eq("emp_num", effectiveEmpNum);

    if (!error && data) {
      const map = {};
      data.forEach((entry) => {
        map[entry.audio_name] = entry;
      });
      setListened(map);
    }
  };

  const handleSaveUserInfo = () => {
    if (!department.trim() || !name.trim() || employeeNo.length < 8) return;
    localStorage.setItem("employeeNo", employeeNo);
    localStorage.setItem("department", department);
    localStorage.setItem("name", name);
    setShowModal(false);
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

  const commitProgress = async (audio, el, forceComplete = false) => {
    if (!el) return;

    const total = Number(el.duration) || 0;
    const current = Number(el.currentTime) || 0;
    const listenedSeconds = Math.floor(current);
    const isCompleted =
      forceComplete || (total ? current / total >= 0.95 : false);

    setListened((prev) => ({
      ...prev,
      [audio.name]: {
        ...(prev[audio.name] || {}),
        duration: listenedSeconds,
        completed: isCompleted,
      },
    }));

    if (!effectiveEmpNum) return;

    const { data: existing, error: findErr } = await supabase
      .from("audio_progress")
      .select("id")
      .eq("emp_num", effectiveEmpNum)
      .eq("audio_name", audio.name)
      .maybeSingle();

    if (findErr) return;

    if (existing) {
      await supabase
        .from("audio_progress")
        .update({ duration: listenedSeconds, completed: isCompleted })
        .eq("id", existing.id);
    } else {
      await supabase.from("audio_progress").insert({
        emp_num: effectiveEmpNum,
        audio_name: audio.name,
        duration: listenedSeconds,
        completed: isCompleted,
        department: department,
        user_name: name,
      });
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

  const tolerance = 1.0;
  const clampToMax = (name, el) => {
    const max = maxPlayedRef.current[name] || 0;
    if (el.currentTime > max + tolerance && !ignoreSeekRef.current[name]) {
      ignoreSeekRef.current[name] = true;
      el.currentTime = max;
      setTimeout(() => {
        ignoreSeekRef.current[name] = false;
      }, 0);
      return true;
    }
    return false;
  };

  const handleTimeUpdateGuarded = (audio, el) => {
    const name = audio.name;
    if (el.seeking || userSeekingRef.current[name]) {
      if (clampToMax(name, el)) {
        updateProgress(name, el.currentTime, el.duration);
        return;
      }
    }
    updateProgress(name, el.currentTime, el.duration);
    const current = el.currentTime || 0;
    const prevMax = maxPlayedRef.current[name] || 0;
    if (current > prevMax) {
      maxPlayedRef.current[name] = current;
    }
  };

  const handleSeeking = (audio, el) => {
    const name = audio.name;
    userSeekingRef.current[name] = true;
    clampToMax(name, el);
  };

  const handleSeeked = (audio, el) => {
    const name = audio.name;
    clampToMax(name, el);
    userSeekingRef.current[name] = false;
  };

  const handleLoadedMetadata = (audio, el) => {
    const saved = listened[audio.name]?.duration || 0;
    maxPlayedRef.current[audio.name] = saved;
    if (saved > 0 && saved < (el.duration || 0)) {
      el.currentTime = saved;
    }
  };

  const handleRateChange = (e) => {
    if (e.target.playbackRate !== 1) {
      e.target.playbackRate = 1;
    }
  };

  return (
    <div className="voice-page">
      {showModal && (
        <div className="modal-overlay-audio">
          <div className="modal-content-audio start-content-audio" >
            <h2>🎓 请输入您的信息</h2>

            <input
              type="text"
              value={employeeNo}
              onChange={(e) => {
                const value = e.target.value;
                if (/^\d*$/.test(value)) {
                  setEmployeeNo(value);
                  if (value.length < 8) {
                    setEmployeeError("请输入正确的工号");
                  } else {
                    setEmployeeError("");
                  }
                }
              }}
              placeholder="工号"
              style={{ width: "250px" }}
            />
            {employeeError && <p style={{ color: "red", marginTop: "0px" }}>{employeeError}</p>}

            <Select
              options={departments}
              value={departments.find((d) => d.value === department)}
              placeholder="选择部门"
              onChange={(selected) => setDepartment(selected ? selected.value : "")}
              styles={{
                container: (base) => ({
                  ...base,
                  width: "275px",
                  borderRadius: "12px",
                  color: "black",
                  margin: "0 auto",
                }),
                control: (base) => ({
                  ...base,
                  borderRadius: "8px",
                  fontSize: "12px",
                  textAlign: "left",
                  minHeight: "40px",
                  paddingLeft: "5px",
                }),
                placeholder: (base) => ({
                  ...base,
                  textAlign: "left",
                  marginLeft: 0,
                }),
              }}
            />

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="姓名"
              style={{ width: "250px" }}
            />

            <button
              onClick={handleSaveUserInfo}
              disabled={
                !department.trim() || !name.trim() || employeeNo.length < 8
              }
              style={{
                backgroundColor:
                  !department.trim() || !name.trim() || employeeNo.length < 8
                    ? "#ccc"
                    : "#4CAF50",
                color: "white",
                padding: "8px 16px",
                border: "none",
                cursor:
                  !department.trim() || !name.trim() || employeeNo.length < 8
                    ? "not-allowed"
                    : "pointer",
                marginTop: "10px",
              }}
            >
              🎧 听语音
            </button>
          </div>
        </div>
      )}

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
                    controlsList="nodownload noplaybackrate noremoteplayback"
                    disablePictureInPicture
                    ref={(el) => (audioRefs.current[audio.name] = el)}
                    onLoadedMetadata={(e) =>
                      handleLoadedMetadata(audio, e.target)
                    }
                    onTimeUpdate={(e) =>
                      handleTimeUpdateGuarded(audio, e.target)
                    }
                    onSeeking={(e) => handleSeeking(audio, e.target)}
                    onSeeked={(e) => handleSeeked(audio, e.target)}
                    onRateChange={handleRateChange}
                    onPause={(e) => {setUserPaused(true); e.target.pause(); commitProgress(audio, e.target)}}
                    onPlay={() => setUserPaused(false)}
                    onEnded={(e) => commitProgress(audio, e.target, true)}
                  >
                    <source src={audio.url} />
                  </audio>

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


// https://youtu.be/RSN_We4Myx8

// import React, { useEffect, useState } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import { supabase } from "./supabaseClient";
// import { QRCodeCanvas } from "qrcode.react";
// import "./VoicePage.css";

// function VoicePage({ empNum, isAdmin, onBack }) {
//   const { audioName } = useParams();
//   const navigate = useNavigate();

//   const [videos, setVideos] = useState([]);
//   const [notFound, setNotFound] = useState(false);
//   const [showQR, setShowQR] = useState({});
//   const [showModal, setShowModal] = useState(false);
//   const [newVideoName, setNewVideoName] = useState("");
//   const [newVideoUrl, setNewVideoUrl] = useState("");
//   const [uploading, setUploading] = useState(false);

//   // Detect and normalize URLs (YouTube / PeerTube)
//   const getEmbedUrl = (url) => {
//     try {
//       const urlObj = new URL(url);

//       // 🎥 YouTube handling
//       if (urlObj.hostname.includes("youtube.com") || urlObj.hostname.includes("youtu.be")) {
//         let videoId = "";
//         if (urlObj.hostname.includes("youtube.com")) {
//           if (urlObj.pathname.startsWith("/shorts/")) {
//             videoId = urlObj.pathname.split("/")[2];
//           } else {
//             videoId = urlObj.searchParams.get("v");
//           }
//         } else if (urlObj.hostname.includes("youtu.be")) {
//           videoId = urlObj.pathname.slice(1);
//         }
//         if (!videoId) return "";
//         return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1&enablejsapi=1`;
//       }

//       // 🎥 PeerTube handling (embed)
//       if (urlObj.pathname.includes("/videos/embed/")) {
//         return `${url}?autoplay=1&mute=1`;
//       }

//       return ""; // unsupported
//     } catch {
//       return "";
//     }
//   };


//   // Fetch videos from Supabase
//   const fetchVideos = async () => {
//     const { data, error } = await supabase
//       .from("videos")
//       .select("*")
//       .order("created_at", { ascending: false });

//     if (!error && data) {
//       const filtered = audioName ? data.filter((v) => v.name === audioName) : data;
//       const normalizedVideos = filtered.map((v) => ({
//         ...v,
//         embedUrl: getEmbedUrl(v.youtube_url),
//       }));
//       setVideos(normalizedVideos);
//       setNotFound(Boolean(audioName && normalizedVideos.length === 0));
//     }
//   };

//   useEffect(() => {
//     fetchVideos();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   // Add new video
//   const handleAddVideo = async () => {
//     if (!newVideoName.trim() || !newVideoUrl.trim()) {
//       alert("Please fill in both name and video URL.");
//       return;
//     }
//     setUploading(true);
//     const { error } = await supabase.from("videos").insert([
//       { name: newVideoName.trim(), youtube_url: newVideoUrl.trim() },
//     ]);
//     if (error) {
//       alert("Error adding video: " + error.message);
//     } else {
//       setNewVideoName("");
//       setNewVideoUrl("");
//       setShowModal(false);
//       fetchVideos();
//     }
//     setUploading(false);
//   };

//   // Delete video
//   const handleDelete = async (id) => {
//     if (!window.confirm("Are you sure you want to delete this video?")) return;
//     const { error } = await supabase.from("videos").delete().eq("id", id);
//     if (!error) fetchVideos();
//   };

//   // Back button
//   const handleBack = () => {
//     if (onBack) return onBack();
//     navigate(audioName ? "/audioPage" : "/");
//   };

//   // Toggle QR
//   const toggleQR = (video) => {
//     setShowQR((prev) => ({ ...prev, [video.id]: !prev[video.id] }));
//   };

//   return (
//     <div className="voice-page">
//       <div className="voice-header">
//         <h2>🎥 视频学习</h2>
//         <button onClick={handleBack}>🔙 返回</button>
//       </div>

//       {notFound ? (
//         <div style={{ padding: "1rem", color: "red" }}>
//           ❌ No video found with the name "{audioName}".
//           <br />
//           <button onClick={() => navigate("/audioPage")}>返回</button>
//         </div>
//       ) : (
//         <>
//           {isAdmin && (
//             <div className="upload-section">
//               <button onClick={() => setShowModal(true)}>➕ 添加新视频</button>
//             </div>
//           )}

//           <div className="video-list">
//             {videos.map((video) => {
//               const qrUrl = `${window.location.origin}/#/audioPage/${video.name}`;
//               return (
//                 <div key={video.id} className="video-item">
//                   <strong>{video.name}</strong>
//                   <div className="video-container">
//                     {video.embedUrl ? (
//                       <iframe
//                         src={video.embedUrl}
//                         width="560"
//                         height="315"
//                         title={video.name}
//                         frameBorder="0"
//                         allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
//                         allowFullScreen
//                       />
//                     ) : (
//                       <div style={{ color: "red" }}>
//                         ❌ Invalid video URL: {video.youtube_url}
//                       </div>
//                     )}
//                   </div>

//                   {isAdmin && (
//                     <>
//                       <div className="video-actions">
//                         <button
//                           className="delete-button"
//                           onClick={() => handleDelete(video.id)}
//                         >
//                           🗑️ 删除
//                         </button>
//                         <button
//                           className="qrCode-button"
//                           onClick={() => toggleQR(video)}
//                         >
//                           📷 创建二维码
//                         </button>
//                       </div>
//                       {showQR[video.id] && (
//                         <div style={{ marginTop: "10px" }}>
//                           <QRCodeCanvas value={qrUrl} size={128} />
//                         </div>
//                       )}
//                     </>
//                   )}
//                 </div>
//               );
//             })}
//           </div>
//         </>
//       )}

//       {/* Modal for adding new video */}
//       {showModal && (
//         <div className="modal-backdrop">
//           <div className="modal">
//             <h3>➕ 添加新视频</h3>
//             <input
//               type="text"
//               placeholder="视频名称"
//               value={newVideoName}
//               onChange={(e) => setNewVideoName(e.target.value)}
//             />
//             <input
//               type="text"
//               placeholder="YouTube 或 PeerTube 链接"
//               value={newVideoUrl}
//               onChange={(e) => setNewVideoUrl(e.target.value)}
//             />
//             <div className="modal-actions">
//               <button onClick={handleAddVideo} disabled={uploading}>
//                 {uploading ? "添加中..." : "添加"}
//               </button>
//               <button onClick={() => setShowModal(false)}>取消</button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// export default VoicePage;
