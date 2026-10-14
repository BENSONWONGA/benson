/**
 * modules/customer — 用户域（模块化单体 · 业务域 4/4）
 * 职责：脚型档案（Fit Profile）—— AI 尺码推荐的核心数据资产。
 * GDPR：欧盟用户的脚型数据属个人数据，删除权必须可达（见 deleteProfile）。
 */

import { store, trackEvent } from "@/lib/db";

export function getFitProfile(sessionId) {
  return store("fitProfiles").get(sessionId) || null;
}

export function saveFitProfile(sessionId, profile) {
  const record = {
    ...profile,
    updatedAt: new Date().toISOString(),
    region: profile.region || "US", // GDPR 分区路由
  };
  store("fitProfiles").set(sessionId, record);
  trackEvent("fit_profile_saved", { sessionId, recommended: profile?.recommendation?.size });
  return record;
}

/** GDPR 数据删除权 —— 合规第一天做对 */
export function deleteProfile(sessionId) {
  const existed = store("fitProfiles").delete(sessionId);
  trackEvent("profile_erased", { sessionId });
  return existed;
}
