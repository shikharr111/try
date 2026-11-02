"use client";
import { useState } from "react";

/**
 * Import wizard: choose type + file -> map columns -> preview validation -> commit.
 * Every step posts the file to the server, which parses and validates it (the browser never decides validity).
 * UNVERIFIED: not rendered in a browser in the build sandbox.
 */
interface Issue { line: number; column?: string; severity: "error" | "warning"; message: string }
interface Preview {
  headers: string[]; mapping: Record<string, number | null>; missing: string[];
  columns: { key: string; label: string; required: boolean; help: string | null }[];
  totalRows: number; validCount: number; errorCount: number; warningCount: number; canCommit: boolean;
  issues: Issue[]; issuesTruncated: boolean; sample: Record<string, string>[]; needsDraft: boolean;
}
const KINDS: { key: string; label: string; needsManage: boolean }[] = [
  { key: "activities", label: "Activities & baseline schedule (into a draft revision)", needsManage: true },
  { key: "dependencies", label: "Activity dependencies (into the draft revision)", needsManage: true },
  { key: "daily_reports", label: "Daily report lines (created as drafts)", needsManage: false },
  { key: "workforce", label: "Workforce records (report must already exist)", needsManage: false },
  { key: "equipment", label: "Equipment records (report must already exist)", needsManage: false },
];

export function ImportWizard({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [kind, setKind] = useState(canManage ? "activities" : "daily_reports");
  const [file, setFile] = useState<File | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function call(mode: "preview" | "commit", map?: Record<string, number | null>) {
    if (!file) return;
    setBusy(true); setError(null); setDone(null);
    try {
      const fd = new FormData();
      fd.set("kind", kind); fd.set("mode", mode); fd.set("file", file);
      if (map) fd.set("mapping", JSON.stringify(map));
      const res = await fetch(`/projects/${projectId}/api/import`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({ error: "Unexpected response from the server." }));
      if (!res.ok) { setError(json.error ?? "Request failed."); if (mode === "preview") setPv(null); return; }
      if (mode === "preview") { setPv(json as Preview); setMapping((json as Preview).mapping); }
      else { setDone(`${json.rows} rows imported. ${json.message ?? ""}`); setPv(null); setFile(null); }
    } catch {
      setError("The request could not be completed. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  const kinds = KINDS.filter((k) => canManage || !k.needsManage);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">What are you importing?
          <select className="input" value={kind} onChange={(e) => { setKind(e.target.value); setPv(null); setDone(null); }}>
            {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </label>
        <label className="label">File (.csv or .xlsx, max 5 MB)
          <input className="input" type="file" accept=".csv,.xlsx,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPv(null); setDone(null); }} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <a className="btn btn-ghost" href={`/projects/${projectId}/api/template?kind=${kind}&format=csv`}>Download CSV template</a>
        <a className="btn btn-ghost" href={`/projects/${projectId}/api/template?kind=${kind}&format=xlsx`}>Download Excel template</a>
        <button type="button" className="btn btn-primary ml-auto" disabled={!file || busy} onClick={() => call("preview")}>{busy ? "Checking…" : "Check file"}</button>
      </div>

      {error && <div role="alert" className="rounded border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">{error}</div>}
      {done && <div role="status" className="rounded border border-ok/30 bg-ok-soft px-3 py-2 text-sm text-ok">{done}</div>}

      {pv && (
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-2">1. Column mapping</h2>
            <p className="mb-3 text-xs text-ink-mute">Columns were matched by name. Change a match if it is wrong, then re-check.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pv.columns.map((c) => (
                <label key={c.key} className="label">{c.label}{c.required && <span className="text-bad"> *</span>}
                  <select className="input" value={mapping[c.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value === "" ? null : Number(e.target.value) })}>
                    <option value="">(not in file)</option>
                    {pv.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                  {c.help && <span className="text-xs font-normal text-ink-mute">{c.help}</span>}
                </label>
              ))}
            </div>
            <button type="button" className="btn btn-secondary mt-3" disabled={busy} onClick={() => call("preview", mapping)}>Re-check with this mapping</button>
          </section>

          <section className="card p-4">
            <h2 className="mb-2">2. Validation</h2>
            <p className="text-sm">
              {pv.totalRows} rows · <strong className={pv.errorCount ? "text-bad" : "text-ok"}>{pv.errorCount} errors</strong> · {pv.warningCount} warnings
              {pv.canCommit ? " · ready to import" : " · fix the errors below and upload the corrected file; nothing is imported while errors remain"}
            </p>
            {pv.needsDraft && pv.canCommit && <p className="mt-1 text-xs text-ink-mute">No draft revision exists; one will be created for this import. The approved baseline is not touched.</p>}
            {pv.issues.length > 0 && (
              <div className="mt-3 max-h-72 overflow-auto">
                <table className="data-table"><thead><tr><th>Line</th><th>Column</th><th>Problem</th></tr></thead><tbody>
                  {pv.issues.map((i, k) => (
                    <tr key={k}><td>{i.line}</td><td>{i.column ?? "—"}</td><td className={i.severity === "error" ? "text-bad" : "text-warn"}>{i.severity === "error" ? "Error: " : "Warning: "}{i.message}</td></tr>
                  ))}
                </tbody></table>
                {pv.issuesTruncated && <p className="mt-1 text-xs text-ink-mute">Showing the first 300 issues.</p>}
              </div>
            )}
            {pv.sample.length > 0 && (
              <details className="mt-3"><summary className="cursor-pointer text-sm">Preview of valid rows ({pv.sample.length} shown)</summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded bg-steel-50 p-2 text-xs">{JSON.stringify(pv.sample, null, 1)}</pre></details>
            )}
          </section>

          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" disabled={!pv.canCommit || busy} onClick={() => call("commit", mapping)}>{busy ? "Importing…" : `Import ${pv.validCount} rows`}</button>
          </div>
        </div>
      )}
    </div>
  );
}
