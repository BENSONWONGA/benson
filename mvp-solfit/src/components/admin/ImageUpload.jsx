/**
 * components/admin/ImageUpload — 后台图片上传组件（主图 + 详图画廊）
 * 两条输入通道：本地上传（POST /api/admin/upload → 站内 URL）或粘贴外链 URL。
 * 商品主图用 ImageUpload；商品详图用 GalleryUpload（多张，可删）。
 */
"use client";

import { useRef, useState } from "react";
import { useAdmin } from "@/components/admin/ui";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

async function uploadOne(token, file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: { "x-admin-token": token },
    body: fd,
  });
  const body = await res.json();
  if (body.code !== 0) throw new Error(body.message || "上传失败");
  return body.data.url;
}

/** 单图上传（商品主图 / 首页主图） */
export default function ImageUpload({ label, value = "", onChange, hint }) {
  const { token } = useAdmin();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同名文件可重复选
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      onChange(await uploadOne(token, file));
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {label ? <label>{label}</label> : null}
      <div className="adm-row">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 2px 8px rgba(23,47,97,0.12)" }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: 12, background: "rgba(120,128,144,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }} className="adm-muted">无图</div>
        )}
        <button className="adm-btn adm-btn-primary adm-btn-sm" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "上传中…" : "本地上传"}
        </button>
        <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={pick} />
        <input placeholder="或粘贴图片 URL" value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
      </div>
      {hint ? <p className="adm-muted" style={{ fontSize: 11, marginTop: 5 }}>{hint}</p> : null}
      {err ? <p style={{ color: "#b3362a", fontSize: 12, marginTop: 5 }}>{err}</p> : null}
    </div>
  );
}

/** 多图上传（商品详图画廊，按顺序展示；上传可多选） */
export function GalleryUpload({ label, value = [], onChange, max = 8 }) {
  const { token } = useAdmin();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [err, setErr] = useState(null);

  async function pick(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true); setErr(null);
    try {
      const room = max - value.length;
      for (const f of files.slice(0, room)) {
        const url = await uploadOne(token, f);
        value = [...value, url]; // 顺序追加（await 串行保序）
        onChange(value);
      }
      if (files.length > room) setErr(`最多 ${max} 张，已忽略多余的 ${files.length - room} 张`);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  function addUrl() {
    const v = urlInput.trim();
    if (!v) return;
    if (value.length >= max) return setErr(`最多 ${max} 张`);
    onChange([...value, v]);
    setUrlInput("");
    setErr(null);
  }

  function remove(i) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      {label ? <label>{label}（{value.length}/{max}，第一张前的主图位由"商品主图"决定，这里展示在主图下方）</label> : null}
      <div className="adm-row" style={{ marginBottom: 8 }}>
        <button className="adm-btn adm-btn-primary adm-btn-sm" type="button" disabled={busy || value.length >= max} onClick={() => inputRef.current?.click()}>
          {busy ? "上传中…" : "本地上传（可多选）"}
        </button>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={pick} />
        <input placeholder="或粘贴图片 URL 后回车/添加" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button className="adm-btn adm-btn-outline adm-btn-sm" type="button" onClick={addUrl} disabled={!urlInput.trim()}>添加</button>
      </div>
      {value.length ? (
        <div className="adm-row">
          {value.map((url, i) => (
            <div key={i} style={{ position: "relative", width: 64, height: 64 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`详图 ${i + 1}`} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 2px 8px rgba(23,47,97,0.12)" }} />
              <button
                type="button"
                onClick={() => remove(i)}
                title="删除这张"
                style={{
                  position: "absolute", top: -7, right: -7, width: 20, height: 20, borderRadius: 99,
                  border: "1px solid rgba(255,59,48,0.4)", background: "rgba(255,59,48,0.92)", color: "#fff", fontSize: 12, lineHeight: 1, cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(215,0,21,0.35)",
                }}
              >
                ×
              </button>
              <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 10, background: "rgba(27,34,51,0.7)", color: "#fff", borderRadius: 4, padding: "0 5px" }}>{i + 1}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="adm-muted" style={{ fontSize: 11 }}>暂无详图 —— 上传多张会在商品详情页主图下方形成画廊（点缩略图切换）</p>
      )}
      {err ? <p style={{ color: "#b3362a", fontSize: 12, marginTop: 5 }}>{err}</p> : null}
    </div>
  );
}
