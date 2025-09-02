// VoicePage.js
// import React, { useEffect, useState, useRef } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import { supabase } from "./supabaseClient";
// import { QRCodeCanvas } from "qrcode.react";
// import "./VoicePage.css";

// function VoicePage({ empNum, isAdmin, onBack }) {
//   const { audioName } = useParams();
//   const navigate = useNavigate();
//   const [audios, setAudios] = useState([]);
//   const [listened, setListened] = useState({});
//   const [uploading, setUploading] = useState(false);
//   const [selectedFile, setSelectedFile] = useState(null);
//   const [progress, setProgress] = useState({});
//   const [uploadProgress, setUploadProgress] = useState(0);
//   const [uploadStatus, setUploadStatus] = useState("");
//   const [notFound, setNotFound] = useState(false);
//   const [showQR, setShowQR] = useState({});
//   const audioRefs = useRef({});

//   // Anti fast-forward state
//   const maxPlayedRef = useRef({});     // { [audioName]: seconds }
//   const ignoreSeekRef = useRef({});    // { [audioName]: boolean }
//   const userSeekingRef = useRef({});   // { [audioName]: boolean }

//   useEffect(() => {
//     fetchAudios();
//     fetchListened();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   useEffect(() => {
//     const tryAutoPlay = () => {
//       if (!audioName || audios.length === 0) return;
//       const matchingAudio = audios.find(
//         (a) => a.name.replace(/\.[^/.]+$/, "") === audioName
//       );
//       const isCompleted =
//         matchingAudio && listened[matchingAudio.name]?.completed;
//       const audioEl = matchingAudio && audioRefs.current[matchingAudio.name];

//       if (matchingAudio && audioEl && !isCompleted) {
//         audioEl.play().catch(() => {
//           const resumeOnInteraction = () => {
//             audioEl
//               .play()
//               .finally(() => {
//                 window.removeEventListener("click", resumeOnInteraction);
//                 window.removeEventListener("keydown", resumeOnInteraction);
//               })
//               .catch(() => {});
//           };
//           window.addEventListener("click", resumeOnInteraction);
//           window.addEventListener("keydown", resumeOnInteraction);
//         });
//       }
//     };

//     tryAutoPlay();
//   }, [audios, audioName, listened]);

//   const fetchAudios = async () => {
//     const { data, error } = await supabase.storage
//       .from("voice-audios")
//       .list("", {
//         limit: 100,
//         sortBy: { column: "name", order: "asc" },
//       });
//     if (!error && data) {
//       const urls = await Promise.all(
//         data.map(async (file) => {
//           const { data: publicUrlData } = supabase.storage
//             .from("voice-audios")
//             .getPublicUrl(file.name);
//           return { name: file.name, url: publicUrlData.publicUrl };
//         })
//       );
//       const filtered = audioName
//         ? urls.filter(
//             (file) => file.name.replace(/\.[^/.]+$/, "") === audioName
//           )
//         : urls;
//       setAudios(filtered);
//       setNotFound(Boolean(audioName && filtered.length === 0));
//     }
//   };

//   const fetchListened = async () => {
//     if (!empNum) return;
//     const { data, error } = await supabase
//       .from("audio_progress")
//       .select("audio_name, duration, completed")
//       .eq("emp_num", empNum);

//     if (!error && data) {
//       const map = {};
//       data.forEach((entry) => {
//         map[entry.audio_name] = entry;
//       });
//       setListened(map);
//     }
//   };

//   const handleUpload = async () => {
//     if (!selectedFile) return;

//     setUploading(true);
//     setUploadProgress(0);
//     setUploadStatus("");

//     const formData = new FormData();
//     formData.append("file", selectedFile);

//     const xhr = new XMLHttpRequest();
//     xhr.open(
//       "POST",
//       "https://epdnvsarvkucabnntbws.supabase.co/functions/v1/upload-audio"
//     );

//     xhr.upload.onprogress = (event) => {
//       if (event.lengthComputable) {
//         const percentComplete = Math.round((event.loaded / event.total) * 100);
//         setUploadProgress(percentComplete);
//       }
//     };

//     xhr.onload = () => {
//       if (xhr.status === 200) {
//         setUploadStatus("✅ Upload successful!");
//         fetchAudios();
//         setSelectedFile(null);
//       } else {
//         setUploadStatus("❌ Upload failed: " + xhr.responseText);
//       }
//       setUploading(false);
//     };

//     xhr.onerror = () => {
//       setUploadStatus("❌ Upload error");
//       setUploading(false);
//     };

//     xhr.send(formData);
//   };

//   const handleDelete = async (fileName) => {
//     const confirmed = window.confirm(
//       `Are you sure you want to delete ${fileName}?`
//     );
//     if (!confirmed) return;
//     const { error } = await supabase.storage
//       .from("voice-audios")
//       .remove([fileName]);
//     if (!error) {
//       fetchAudios();
//     }
//   };

//   // Persist progress using playback time; no manual add/remove listeners
//   const commitProgress = async (audio, el, forceComplete = false) => {
//     if (!el) return;

//     const total = Number(el.duration) || 0;
//     const current = Number(el.currentTime) || 0;
//     const listenedSeconds = Math.floor(current);
//     const isCompleted =
//       forceComplete || (total ? current / total >= 0.95 : false);

//     // Update UI immediately
//     setListened((prev) => ({
//       ...prev,
//       [audio.name]: {
//         ...(prev[audio.name] || {}),
//         duration: listenedSeconds,
//         completed: isCompleted,
//       },
//     }));

//     if (!empNum) return;

//     const { data: existing, error: findErr } = await supabase
//       .from("audio_progress")
//       .select("id")
//       .eq("emp_num", empNum)
//       .eq("audio_name", audio.name)
//       .maybeSingle();

//     if (findErr) {
//       console.error("find error", findErr);
//       return;
//     }

//     if (existing) {
//       const { error: updErr } = await supabase
//         .from("audio_progress")
//         .update({ duration: listenedSeconds, completed: isCompleted })
//         .eq("id", existing.id)
//         .select("*");
//       if (updErr) console.error("update error", updErr);
//     } else {
//       const { error: insErr } = await supabase
//         .from("audio_progress")
//         .insert({
//           emp_num: empNum,
//           audio_name: audio.name,
//           duration: listenedSeconds,
//           completed: isCompleted,
//         })
//         .select("*");
//       if (insErr) console.error("insert error", insErr);
//     }
//   };

//   const updateProgress = (audioName, current, total) => {
//     setProgress((prev) => ({
//       ...prev,
//       [audioName]: {
//         percent: total ? (current / total) * 100 : 0,
//         current,
//         total,
//       },
//     }));
//   };

//   const handleBack = () => {
//     if (onBack) return onBack();
//     if (audioName) navigate("/audioPage");
//     else navigate("/");
//   };

//   const toggleQR = (audio) => {
//     setShowQR((prev) => ({
//       ...prev,
//       [audio.name]: !prev[audio.name],
//     }));
//   };

//   // ---------- Anti fast-forward handlers ----------
//   const tolerance = 1.0; // seconds; higher to avoid stutter on normal playback

//   const clampToMax = (name, el) => {
//     const max = maxPlayedRef.current[name] || 0;
//     if (el.currentTime > max + tolerance && !ignoreSeekRef.current[name]) {
//       ignoreSeekRef.current[name] = true;
//       el.currentTime = max;
//       // release guard next tick
//       setTimeout(() => {
//         ignoreSeekRef.current[name] = false;
//       }, 0);
//       return true; // clamped
//     }
//     return false;
//   };

//   // Time updates during normal playback should NOT clamp
//   const handleTimeUpdateGuarded = (audio, el) => {
//     const name = audio.name;

//     // Only enforce while the element is seeking (user dragging/clicking)
//     if (el.seeking || userSeekingRef.current[name]) {
//       if (clampToMax(name, el)) {
//         updateProgress(name, el.currentTime, el.duration);
//         return;
//       }
//     }

//     // Normal progression: update and grow max
//     updateProgress(name, el.currentTime, el.duration);
//     const current = el.currentTime || 0;
//     const prevMax = maxPlayedRef.current[name] || 0;
//     if (current > prevMax) {
//       maxPlayedRef.current[name] = current;
//     }
//   };

//   const handleSeeking = (audio, el) => {
//     const name = audio.name;
//     userSeekingRef.current[name] = true;
//     clampToMax(name, el);
//   };

//   const handleSeeked = (audio, el) => {
//     const name = audio.name;
//     clampToMax(name, el);
//     // done with seeking
//     userSeekingRef.current[name] = false;
//   };

//   const handleLoadedMetadata = (audio, el) => {
//     // Initialize "max played" from saved progress if any
//     const saved = listened[audio.name]?.duration || 0;
//     maxPlayedRef.current[audio.name] = saved;

//     // Optional: resume where left off
//     if (saved > 0 && saved < (el.duration || 0)) {
//       el.currentTime = saved;
//     }
//   };

//   const handleRateChange = (e) => {
//     if (e.target.playbackRate !== 1) {
//       e.target.playbackRate = 1;
//     }
//   };
//   // ------------------------------------------------

//   return (
//     <div className="voice-page">
//       <div className="voice-header">
//         <h2>🎧 收听音频</h2>
//         <button onClick={handleBack}>🔙 返回</button>
//       </div>

//       {notFound ? (
//         <div style={{ padding: "1rem", color: "red" }}>
//           ❌ No audio found with the name "{audioName}".
//           <br />
//           <button onClick={() => navigate("/audioPage")}>返回</button>
//         </div>
//       ) : (
//         <>
//           {isAdmin && (
//             <div className="upload-section">
//               <input
//                 type="file"
//                 onChange={(e) => setSelectedFile(e.target.files[0])}
//               />

//               <button
//                 onClick={handleUpload}
//                 disabled={uploading || !selectedFile}
//               >
//                 {uploading ? `上传中 (${uploadProgress}%)...` : "上传音频"}
//               </button>

//               {uploading && (
//                 <div
//                   className="upload-progress-bar"
//                   style={{ marginTop: "10px" }}
//                 >
//                   <div
//                     className="upload-progress-fill"
//                     style={{
//                       width: `${uploadProgress}%`,
//                       height: "8px",
//                       backgroundColor: "#4caf50",
//                       transition: "width 0.3s",
//                     }}
//                   />
//                 </div>
//               )}

//               {uploadStatus && (
//                 <div className="upload-status">{uploadStatus}</div>
//               )}
//             </div>
//           )}

//           <div className="audio-list">
//             {audios.map((audio) => {
//               const listenedEntry = listened[audio.name];
//               const listenedClass = listenedEntry?.completed ? "listened" : "";
//               const cleanName = audio.name.replace(/\.[^/.]+$/, "");
//               const qrUrl = `${window.location.origin}/#/audioPage/${cleanName}`;

//               return (
//                 <div
//                   key={audio.name}
//                   className={`audio-item ${listenedClass}`}
//                 >
//                   <strong>{audio.name}</strong>

//                   <audio
//                     controls
//                     controlsList="nodownload noplaybackrate noremoteplayback"
//                     disablePictureInPicture
//                     ref={(el) => (audioRefs.current[audio.name] = el)}
//                     onLoadedMetadata={(e) =>
//                       handleLoadedMetadata(audio, e.target)
//                     }
//                     onTimeUpdate={(e) =>
//                       handleTimeUpdateGuarded(audio, e.target)
//                     }
//                     onSeeking={(e) => handleSeeking(audio, e.target)}
//                     onSeeked={(e) => handleSeeked(audio, e.target)}
//                     onRateChange={handleRateChange}
//                     onPause={(e) => commitProgress(audio, e.target)}
//                     onEnded={(e) => commitProgress(audio, e.target, true)}
//                   >
//                     <source src={audio.url} />
//                   </audio>

//                   {listenedEntry?.completed && <div>✅ 完成了</div>}
//                   {!listenedEntry?.completed &&
//                     listenedEntry?.duration > 0 && (
//                       <div>
//                         ⏱️已听<b>{listenedEntry.duration}</b>秒
//                       </div>
//                     )}

//                   {isAdmin && (
//                     <>
//                       <button
//                         className="delete-button"
//                         onClick={() => handleDelete(audio.name)}
//                       >
//                         🗑️ 删除
//                       </button>
//                       <button
//                         className="qrCode-button"
//                         onClick={() => toggleQR(audio)}
//                       >
//                         📷 创建二维码
//                       </button>
//                       {showQR[audio.name] && (
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
//     </div>
//   );
// }

// export default VoicePage;

// https://youtu.be/RSN_We4Myx8

import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { QRCodeCanvas } from "qrcode.react";
import "./VoicePage.css";

function VoicePage({ empNum, isAdmin, onBack }) {
  const { audioName } = useParams(); // reuse param for videoName
  const navigate = useNavigate();

  const [videos, setVideos] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [showQR, setShowQR] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [newVideoName, setNewVideoName] = useState("");
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const ytPlayersRef = useRef({}); // store all YouTube players

  // Load YouTube API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
  }, []);

  // Normalize YouTube URL to embed
  const getEmbedUrl = (url) => {
    try {
      const urlObj = new URL(url);
      let videoId = "";

      if (urlObj.hostname.includes("youtube.com")) {
        if (urlObj.pathname.startsWith("/shorts/")) {
          videoId = urlObj.pathname.split("/")[2]; // /shorts/VIDEO_ID
        } else {
          videoId = urlObj.searchParams.get("v");
        }
      } else if (urlObj.hostname.includes("youtu.be")) {
        videoId = urlObj.pathname.slice(1);
      }

      if (!videoId) return ""; // invalid URL
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1&rel=0&modestbranding=1`;
    } catch {
      return ""; // invalid URL
    }
  };


  const fetchVideos = async () => {
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      const filtered = audioName ? data.filter((v) => v.name === audioName) : data;
      const normalizedVideos = filtered.map((v) => ({
        ...v,
        embedUrl: getEmbedUrl(v.youtube_url),
      }));
      setVideos(normalizedVideos);
      setNotFound(Boolean(audioName && normalizedVideos.length === 0));
    }
  };

  useEffect(() => {
    fetchVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddVideo = async () => {
    if (!newVideoName.trim() || !newVideoUrl.trim()) {
      alert("Please fill in both name and YouTube URL.");
      return;
    }
    setUploading(true);
    const { error } = await supabase.from("videos").insert([
      { name: newVideoName.trim(), youtube_url: newVideoUrl.trim() },
    ]);
    if (error) {
      alert("Error adding video: " + error.message);
    } else {
      setNewVideoName("");
      setNewVideoUrl("");
      setShowModal(false);
      fetchVideos();
    }
    setUploading(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this video?")) return;
    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (!error) fetchVideos();
  };

  const handleBack = () => {
    if (onBack) return onBack();
    navigate(audioName ? "/audioPage" : "/");
  };

  const toggleQR = (video) => {
    setShowQR((prev) => ({ ...prev, [video.id]: !prev[video.id] }));
  };

  const handleUnmute = (videoId) => {
    const player = ytPlayersRef.current[videoId];
    if (player && typeof player.unMute === "function") {
      player.unMute();
      player.setVolume(100);
    }
  };

  // Initialize YouTube players after videos render
  useEffect(() => {
    if (!window.YT || videos.length === 0) return;

    videos.forEach((video) => {
      const iframe = document.getElementById(`yt-${video.id}`);
      if (!iframe || ytPlayersRef.current[video.id]) return;

      const player = new window.YT.Player(`yt-${video.id}`, {
        events: {
          onReady: (event) => {
            event.target.mute();
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              Object.values(ytPlayersRef.current).forEach((p) => {
                if (p !== event.target) p.pauseVideo();
              });
            }
          },
        },
      });

      ytPlayersRef.current[video.id] = player;
    });
  }, [videos]);


  return (
    <div className="voice-page">
      <div className="voice-header">
        <h2>🎥 视频学习</h2>
        <button onClick={handleBack}>🔙 返回</button>
      </div>

      {notFound ? (
        <div style={{ padding: "1rem", color: "red" }}>
          ❌ No video found with the name "{audioName}".
          <br />
          <button onClick={() => navigate("/audioPage")}>返回</button>
        </div>
      ) : (
        <>
          {isAdmin && (
            <div className="upload-section">
              <button onClick={() => setShowModal(true)}>➕ 添加新视频</button>
            </div>
          )}

          <div className="video-list">
            {videos.map((video) => {
              const qrUrl = `${window.location.origin}/#/audioPage/${video.name}`;
              return (
                <div key={video.id} className="video-item">
                  <strong>{video.name}</strong>
                  <div className="video-container">
                    {video.embedUrl ? (
                      <iframe
                        id={`yt-${video.id}`}
                        src={video.embedUrl}
                        width="560"
                        height="315"
                        title={video.name}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div style={{ color: "red" }}>
                        ❌ Invalid YouTube URL: {video.youtube_url}
                      </div>
                    )}

                    <div
                      className="video-overlay"
                      onClick={() => handleUnmute(video.id)}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        cursor: "pointer",
                      }}
                    >
                      🔊 点击解锁声音
                    </div>
                  </div>

                  {isAdmin && (
                    <>
                      <div className="video-actions">
                        <button
                          className="delete-button"
                          onClick={() => handleDelete(video.id)}
                        >
                          🗑️ 删除
                        </button>
                        <button
                          className="qrCode-button"
                          onClick={() => toggleQR(video)}
                        >
                          📷 创建二维码
                        </button>
                      </div>
                      {showQR[video.id] && (
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

      {/* Modal for adding new video */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>➕ 添加新视频</h3>
            <input
              type="text"
              placeholder="视频名称"
              value={newVideoName}
              onChange={(e) => setNewVideoName(e.target.value)}
            />
            <input
              type="text"
              placeholder="YouTube 链接"
              value={newVideoUrl}
              onChange={(e) => setNewVideoUrl(e.target.value)}
            />
            <div className="modal-actions">
              <button onClick={handleAddVideo} disabled={uploading}>
                {uploading ? "添加中..." : "添加"}
              </button>
              <button onClick={() => setShowModal(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VoicePage;
