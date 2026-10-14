/**
 * components/admin/AdminFrame — 非 merchant 后台页面的公共玻璃框架（服务端组件）
 *
 * 与 AdminShell 的关系：复用 admin.css 的 iOS 26 液态玻璃设计系统（.adm-wall 壁纸
 * + .adm-* 原子类 + .adm-shell 设计令牌），但不并入商家后台的壳 ——
 * 总后台（master 令牌独立鉴权）/ 监控看板 / 基线看板保持各自的独立路由与门禁。
 *
 * 外层挂 .adm-shell 是为了继承设计令牌与 .adm-shell 的表单/链接基线
 * （.adm-shell input/label/select/a）；frame.css 里用 .adm-shell.adm-frame
 * 把「侧栏 + 主区」的 flex 壳覆盖为块级排版。
 *
 * 用法：
 *   <AdminFrame eyebrow="老板 / 超管" title="总后台" subtitle="……说明文案……">
 *     {children}
 *   </AdminFrame>
 */

import "../../app/admin/admin.css";
import "../../app/admin/frame.css";

export default function AdminFrame({ eyebrow, title, subtitle, children }) {
  return (
    <div className="adm-shell adm-frame">
      {/* 液态壁纸（漂移色斑）——同 AdminShell 的 Wall */}
      <div className="adm-wall" aria-hidden>
        <i className="wb-a" />
        <i className="wb-b" />
        <i className="wb-c" />
        <i className="wb-d" />
      </div>

      <div className="adm-frame-inner">
        <header className="adm-frame-head">
          {eyebrow ? <div className="adm-frame-eyebrow">{eyebrow}</div> : null}
          <h1 className="adm-frame-title">{title}</h1>
          {subtitle ? <p className="adm-frame-sub">{subtitle}</p> : null}
        </header>
        {children}
      </div>
    </div>
  );
}
