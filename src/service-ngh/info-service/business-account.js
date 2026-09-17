export function getBusinessAccount(profile = {}) {
  let pkg = profile.bizPkg;
  if (typeof pkg === 'string') { try { pkg = JSON.parse(pkg); } catch { pkg = null; } }
  const id = Number(pkg?.pkgId);
  const label = typeof pkg?.label === 'string' ? pkg.label.trim() : '';
  const active = id > 0 || Boolean(label);
  const type = label || ({ 1: 'Basic', 3: 'Pro' })[id];
  return { businessAccount: active ? 'Có' : 'Không', businessType: active ? (type ? `Business · ${type}` : 'Business') : 'Cá nhân' };
}
