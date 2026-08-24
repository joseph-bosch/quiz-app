// FormPage.js — mini-program suggestion form (reached directly at /#/formPage)
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Select from "react-select";
import { supabase } from "./supabaseClient";
import { departmentOptions } from "./departments";
import { isAdminName } from "./admins";
import "./FormPage.css";

const AVATAR_BUCKET = "miniprogram-avatars";
const SUGGESTIONS_TABLE = "miniprogram_suggestions";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB, matches the original form limit

// Rising background particles. Values are derived from the index rather than
// Math.random() so they stay stable across re-renders (random values would
// restart every animation on each keystroke).
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 6.3 + 2) % 98,
  size: 3 + (i % 3),
  dur: 15 + (i % 6) * 3,
  delay: (i * 1.6) % 18,
}));

// Mirrors the .form-input styling in FormPage.css
const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: "48px",
    borderRadius: "10px",
    fontSize: "15px",
    textAlign: "left",
    backgroundColor: state.isFocused ? "#ffffff" : "#f6f8fa",
    borderWidth: "1.5px",
    borderColor: state.isFocused ? "#0a84ff" : "#dde3e9",
    boxShadow: state.isFocused ? "0 0 0 4px rgba(10,132,255,0.14)" : "none",
    transition: "border-color .2s ease, background .2s ease, box-shadow .2s ease",
    "&:hover": { borderColor: state.isFocused ? "#0a84ff" : "#c3ccd6" },
  }),
  valueContainer: (base) => ({ ...base, padding: "2px 12px" }),
  placeholder: (base) => ({ ...base, color: "#9aa5b1" }),
  menu: (base) => ({
    ...base,
    textAlign: "left",
    borderRadius: "10px",
    overflow: "hidden",
    boxShadow: "0 12px 32px rgba(0,20,40,.18)",
  }),
  // The menu is portalled to <body>; without a z-index here it would sit
  // under the card. (Each .form-question has a filling animation, which keeps
  // a stacking context alive and would otherwise trap an in-card menu.)
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? "#0a84ff" : state.isFocused ? "#eaf3ff" : "#fff",
    color: state.isSelected ? "#fff" : "#1b1b1b",
    cursor: "pointer",
  }),
};

const FormPage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Prefill from whatever the user already entered elsewhere in the app
  const [name, setName] = useState(localStorage.getItem("name") || "");
  const [department, setDepartment] = useState(localStorage.getItem("department") || "");
  const [employeeNo, setEmployeeNo] = useState(localStorage.getItem("employeeNo") || "");
  const [suggestedName, setSuggestedName] = useState("");

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  // Release the object URL so repeated picks do not leak memory
  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); };
  }, [avatarPreview]);

  // Same convention as the quiz screen: the name field decides what admin UI shows.
  const isAdmin = isAdminName(name);

  const empNoValid = /^\d{8,}$/.test(employeeNo);
  const canSubmit =
    !!name.trim() &&
    !!department &&
    empNoValid &&
    !!suggestedName.trim() &&
    !!avatarFile &&
    !submitting;

  // Note: revoking is handled solely by the effect cleanup above. Doing it inside a
  // state updater would be an impure updater, which StrictMode double-invokes.
  const clearFile = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Shared by the file picker and drag-and-drop
  const acceptFile = (file) => {
    setFileError("");
    if (!file) { clearFile(); return; }

    if (!file.type.startsWith("image/")) {
      setFileError("请上传图片文件（JPG / PNG / GIF 等）");
      clearFile();
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError("文件大小不能超过 10MB");
      clearFile();
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleFileChange = (e) => {
    acceptFile(e.target.files && e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files && e.dataTransfer.files[0]); // only the first file
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      // 1. upload the avatar
      const rawExt = (avatarFile.name.split(".").pop() || "png").toLowerCase();
      const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : "png";
      const path = `${employeeNo}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, avatarFile, { cacheControl: "3600", upsert: false, contentType: avatarFile.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

      // 2. save the answers
      const { error: insertError } = await supabase.from(SUGGESTIONS_TABLE).insert([{
        name: name.trim(),
        department,
        emp_num: employeeNo,
        suggested_name: suggestedName.trim(),
        avatar_url: (urlData && urlData.publicUrl) || null,
      }]);
      if (insertError) throw insertError;

      localStorage.setItem("name", name.trim());
      localStorage.setItem("department", department);
      localStorage.setItem("employeeNo", employeeNo);
      setSubmitted(true);
    } catch (err) {
      console.error("Suggestion submit failed:", err);
      setSubmitError(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitAnother = () => {
    setSuggestedName("");
    clearFile();
    setFileError("");
    setSubmitError(null);
    setSubmitted(false);
  };

  // Decorative animated backdrop (purely visual, hidden from screen readers)
  const backdrop = (
    <div className="form-bg" aria-hidden="true">
      {/* rotating aurora ribbons */}
      <div className="fp-aurora" />
      <div className="fp-aurora fp-aurora-2" />

      {/* panning dot grid */}
      <div className="fp-grid" />

      {/* sweeping light beams */}
      <div className="fp-beams"><span /><span /><span /></div>

      {/* morphing organic blobs */}
      <span className="blob blob-1" />
      <span className="blob blob-2" />
      <span className="blob blob-3" />

      {/* crisp Bosch-style geometry */}
      <span className="shape shape-ring" />
      <span className="shape shape-ring-2" />
      <span className="shape shape-square" />
      <span className="shape shape-leaf" />
      <span className="shape shape-leaf-2" />
      <span className="shape shape-dot" />
      <span className="shape shape-pill" />
      <span className="shape shape-tri" />
      <span className="shape shape-cross" />

      {/* rising particles */}
      <div className="fp-particles">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              "--dur": `${p.dur}s`,
              "--delay": `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* film grain */}
      <div className="fp-noise" />
    </div>
  );

  // ======= SUCCESS =======
  if (submitted) {
    return (
      <div className="form-page">
        {backdrop}
        <div className="form-card form-done">
          <svg className="form-check" viewBox="0 0 60 60" aria-hidden="true">
            <circle cx="30" cy="30" r="27" />
            <path d="M18 31.5 L26.5 40 L42 21" />
          </svg>
          <h2>提交成功！</h2>
          <p>感谢您的建议，我们已收到您的提交。</p>
          <div className="form-done-actions">
            <button className="form-secondary-btn" onClick={submitAnother}>再填一份</button>
            <button className="form-submit-btn" onClick={() => navigate("/")}>返回首页</button>
          </div>
        </div>
      </div>
    );
  }

  // ======= FORM =======
  return (
    <div className="form-page">
      {backdrop}
      <div className="form-card">
        {isAdmin && (
          <button
            type="button"
            className="form-admin-btn"
            onClick={() => {
              // The responses page reads the viewer's identity from localStorage,
              // which is otherwise only written on submit — persist it first.
              localStorage.setItem("name", name.trim());
              if (department) localStorage.setItem("department", department);
              if (employeeNo) localStorage.setItem("employeeNo", employeeNo);
              navigate("/formResponses");
            }}
            title="查看所有提交"
          >
            📋 查看提交
          </button>
        )}

        <h1 className="form-title">小程序建议征集</h1>
        <p className="form-subtitle">请填写以下信息（全部为必填项）</p>

        {/* 1. name */}
        <div className="form-question" style={{ "--i": 0 }}>
          <label className="form-label" htmlFor="fp-name">1. 您的姓名？<span className="req">*</span></label>
          <input
            id="fp-name"
            type="text"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入您的姓名"
          />
        </div>

        {/* 2. department */}
        <div className="form-question" style={{ "--i": 1 }}>
          <label className="form-label" htmlFor="fp-dept">2. 您的部门？<span className="req">*</span></label>
          <Select
            inputId="fp-dept"
            options={departmentOptions}
            value={departmentOptions.find((d) => d.value === department) || null}
            placeholder="请选择您的部门"
            onChange={(selected) => setDepartment(selected ? selected.value : "")}
            styles={selectStyles}
            noOptionsMessage={() => "无匹配部门"}
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
          />
        </div>

        {/* 3. employee number */}
        <div className="form-question" style={{ "--i": 2 }}>
          <label className="form-label" htmlFor="fp-emp">3. 您的工号？<span className="req">*</span></label>
          <input
            id="fp-emp"
            type="text"
            inputMode="numeric"
            className="form-input"
            value={employeeNo}
            onChange={(e) => { const v = e.target.value; if (/^\d*$/.test(v)) setEmployeeNo(v); }}
            placeholder="请输入您的工号"
          />
          {employeeNo && !empNoValid && (
            <p className="form-error">请输入正确的工号（至少 8 位数字）</p>
          )}
        </div>

        {/* 4. suggested mini-program name */}
        <div className="form-question" style={{ "--i": 3 }}>
          <label className="form-label" htmlFor="fp-sug">4. 您建议的小程序名称？<span className="req">*</span></label>
          <input
            id="fp-sug"
            type="text"
            className="form-input"
            value={suggestedName}
            onChange={(e) => setSuggestedName(e.target.value)}
            placeholder="请输入您建议的名称"
          />
        </div>

        {/* 5. suggested avatar */}
        <div className="form-question" style={{ "--i": 4 }}>
          <label className="form-label">5. 您建议的小程序头像？<span className="req">*</span></label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="form-file-input"
            onChange={handleFileChange}
          />
          <button
            type="button"
            className={`form-upload-btn${dragging ? " is-dragging" : ""}`}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <span className="form-upload-icon" aria-hidden="true">⬆</span>
            {dragging ? "松开即可上传" : "上传文件 / 拖拽图片到此处"}
          </button>

          <p className="form-hint">文件数量限制：1&nbsp;&nbsp;单个文件大小限制：10MB&nbsp;&nbsp;支持格式：图片</p>
          {fileError && <p className="form-error">{fileError}</p>}

          {avatarFile && (
            <div className="form-file-chip">
              {avatarPreview && <img src={avatarPreview} alt="头像预览" className="form-file-thumb" />}
              <div className="form-file-meta">
                <span className="form-file-name">{avatarFile.name}</span>
                <span className="form-file-size">{(avatarFile.size / 1024).toFixed(0)} KB</span>
              </div>
              <button type="button" className="form-file-remove" onClick={clearFile} aria-label="移除文件">✕</button>
            </div>
          )}
        </div>

        {submitError && <p className="form-error form-submit-error">提交失败：{submitError}</p>}

        <div className="form-actions">
          <button
            type="button"
            className="form-submit-btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? (<><span className="form-spinner" aria-hidden="true" />提交中…</>) : "提交"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FormPage;
