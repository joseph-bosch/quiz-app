// FormResponses.js — admin view of all mini-program suggestion submissions
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { isAdminName } from "./admins";
import "./FormResponses.css";

const SUGGESTIONS_TABLE = "miniprogram_suggestions";
const PAGE_SIZE = 10;

const fmtTime = (ts) =>
  ts
    ? new Date(ts).toLocaleString("en-US", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
    : "";

// Turn "张三 / ShzP-QMM" into something safe for a filename
const safeFileName = (s) => (s || "").replace(/[\\/:*?"<>|]+/g, "-").trim();

const FormResponses = () => {
  const navigate = useNavigate();
  const viewerName = localStorage.getItem("name") || "";
  const isAdmin = isAdminName(viewerName);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [page, setPage] = useState(1);

  const [preview, setPreview] = useState(null);   // row currently previewed
  const [downloading, setDownloading] = useState(false);
  const [downloadNote, setDownloadNote] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      let all = [], from = 0, batch = 1000, more = true;
      while (more) {
        const { data, error } = await supabase
          .from(SUGGESTIONS_TABLE)
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + batch - 1);
        if (error) throw error;
        if (data && data.length) { all = all.concat(data); from += batch; more = data.length === batch; }
        else more = false;
      }
      setRows(all);
    } catch (err) {
      console.error("Load suggestions failed:", err);
      setLoadError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) fetchAll(); else setLoading(false); }, [isAdmin, fetchAll]);

  // Close the preview with Escape
  useEffect(() => {
    if (!preview) return;
    const onKey = (e) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportToExcel = () => {
    const mapped = rows.map((r) => ({
      "Employee No": r.emp_num || "",
      Name: r.name || "",
      Department: r.department || "",
      "Suggested Name": r.suggested_name || "",
      "Picture URL": r.avatar_url || "",
      Time: fmtTime(r.created_at),
    }));
    const ws = XLSX.utils.json_to_sheet(mapped);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Suggestions");
    XLSX.writeFile(wb, "MiniProgram_Suggestions.xlsx");
  };

  // The bucket is on another origin, so <a download> alone would just navigate.
  // Fetching the bytes first is what actually forces a save.
  const downloadPicture = async (row) => {
    if (!row || !row.avatar_url) return;
    setDownloading(true);
    setDownloadNote("");
    try {
      const res = await fetch(row.avatar_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      const urlExt = (row.avatar_url.split(".").pop() || "png").split(/[?#]/)[0];
      const ext = /^[a-z0-9]{1,5}$/i.test(urlExt) ? urlExt : "png";
      const base = safeFileName(`${row.emp_num || "unknown"}-${row.suggested_name || "avatar"}`);

      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${base}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      console.error("Download failed:", err);
      setDownloadNote("下载失败，已在新标签页打开图片。");
      window.open(row.avatar_url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  };

  // ======= NOT AN ADMIN =======
  if (!isAdmin) {
    return (
      <div className="fr-page">
        <div className="fr-card fr-denied">
          <div className="fr-denied-icon">🔒</div>
          <h2>无权访问</h2>
          <p>
            此页面仅限管理员查看。
            {viewerName
              ? <> 当前身份：<strong>{viewerName}</strong></>
              : " 未检测到您的姓名，请在表单中填写姓名后，点击右上角的「查看提交」按钮进入。"}
          </p>
          <button className="fr-btn fr-btn-grey" onClick={() => navigate("/formPage")}>🔙 返回表单</button>
        </div>
      </div>
    );
  }

  // ======= ADMIN VIEW =======
  return (
    <div className="fr-page">
      <div className="fr-card">
        <h2 className="fr-title">📋 小程序建议 — 所有提交</h2>

        <div className="fr-toolbar">
          <button className="fr-btn fr-btn-grey" onClick={() => navigate("/formPage")}>🔙 返回表单</button>
          <button className="fr-btn fr-btn-green" onClick={exportToExcel} disabled={!rows.length}>📤 导出 Excel</button>
          <button className="fr-btn fr-btn-blue fr-right" onClick={fetchAll} disabled={loading}>
            {loading ? "加载中…" : "🔄 刷新"}
          </button>
        </div>

        {loadError && (
          <div className="fr-alert">
            读取失败：{loadError}
            <div className="fr-alert-hint">
              若显示权限错误，请确认已在 Supabase 执行 supabase-formpage-setup.sql 中的读取策略。
            </div>
          </div>
        )}

        {loading ? (
          <p className="fr-empty">加载中…</p>
        ) : rows.length === 0 && !loadError ? (
          <p className="fr-empty">暂无提交记录。</p>
        ) : (
          <>
            <div className="fr-table-wrap">
              <table className="fr-table">
                <thead>
                  <tr>
                    <th>工号</th>
                    <th>姓名</th>
                    <th>部门</th>
                    <th>建议名称</th>
                    <th>提交的图片</th>
                    <th>提交时间</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r, i) => (
                    <tr key={r.id != null ? r.id : i}>
                      <td>{r.emp_num}</td>
                      <td>{r.name}</td>
                      <td>{r.department}</td>
                      <td>{r.suggested_name}</td>
                      <td>
                        {r.avatar_url ? (
                          <div className="fr-pic-actions">
                            <button className="fr-mini fr-mini-blue" onClick={() => setPreview(r)}>👁 查看图片</button>
                            <button
                              className="fr-mini fr-mini-green"
                              onClick={() => downloadPicture(r)}
                              disabled={downloading}
                            >
                              ⬇ 下载
                            </button>
                          </div>
                        ) : (
                          <span className="fr-nopic">无图片</span>
                        )}
                      </td>
                      <td>{fmtTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="fr-pager">
              <button
                className="fr-btn fr-btn-blue"
                disabled={safePage === 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                Previous
              </button>
              <span className="fr-pageinfo">
                第 {safePage} / {totalPages} 页（共 {rows.length} 条）
              </span>
              <button
                className="fr-btn fr-btn-blue"
                disabled={safePage === totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {/* ======= PICTURE PREVIEW MODAL ======= */}
      {preview && (
        <div className="fr-overlay" onClick={() => setPreview(null)} role="dialog" aria-modal="true" aria-label="图片预览">
          <div className="fr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fr-modal-head">
              <div className="fr-modal-meta">
                <strong>{preview.suggested_name || "（未填写名称）"}</strong>
                <span>{preview.name} · {preview.emp_num} · {preview.department}</span>
              </div>
              <button className="fr-close" onClick={() => setPreview(null)} aria-label="关闭">✕</button>
            </div>

            <div className="fr-modal-body">
              <img src={preview.avatar_url} alt={`${preview.name} 提交的头像`} className="fr-preview-img" />
            </div>

            {downloadNote && <p className="fr-download-note">{downloadNote}</p>}

            <div className="fr-modal-foot">
              <a className="fr-btn fr-btn-grey" href={preview.avatar_url} target="_blank" rel="noopener noreferrer">
                🔗 原图链接
              </a>
              <button
                className="fr-btn fr-btn-green"
                onClick={() => downloadPicture(preview)}
                disabled={downloading}
              >
                {downloading ? "下载中…" : "⬇ 下载图片"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormResponses;
