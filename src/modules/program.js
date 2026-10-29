// Outcomes for the program sponsor (e.g. the Chamber): baseline vs latest
// visibility per business, rolled up by sector and district, checked against
// the POC gate.
export const GATE = { relativeUplift: 0.3, shareOfBusinesses: 0.5 };

// Compare like with like: only the assistants used in both audits.
export function compareAudits(first, last) {
  if (!first || !last || first === last) return null;
  const common = Object.keys(first.byProvider).filter((p) => last.byProvider[p]);
  if (!common.length) return null;
  const score = (a) => {
    const answers = common.reduce((s, p) => s + a.byProvider[p].answers, 0);
    return answers ? common.reduce((s, p) => s + a.byProvider[p].named, 0) / answers : 0;
  };
  const baseline = score(first);
  const latest = score(last);
  return {
    providers: common,
    simulated: !common.includes('claude'),
    baseline,
    latest,
    upliftPts: latest - baseline,
    upliftRel: baseline > 0 ? (latest - baseline) / baseline : latest > 0 ? Infinity : 0,
  };
}

export function programReport(businesses, visibility) {
  const rows = businesses.list().map((b) => {
    const history = visibility.history(b.id);
    const cmp = compareAudits(history[0], history.at(-1));
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      sector: b.sector,
      district: b.district || b.city,
      audits: history.length,
      baseline: history[0]?.score ?? null,
      latest: history.at(-1)?.score ?? null,
      comparison: cmp,
      metGate: cmp ? cmp.upliftRel >= GATE.relativeUplift : false,
    };
  });
  const group = (key) =>
    Object.values(
      rows.reduce((acc, r) => {
        const k = r[key];
        acc[k] ??= { [key]: k, businesses: 0, measured: 0, baselineSum: 0, latestSum: 0, metGate: 0 };
        acc[k].businesses++;
        if (r.comparison) {
          acc[k].measured++;
          acc[k].baselineSum += r.comparison.baseline;
          acc[k].latestSum += r.comparison.latest;
          if (r.metGate) acc[k].metGate++;
        }
        return acc;
      }, {}),
    ).map(({ baselineSum, latestSum, ...g }) => ({ ...g, avgBaseline: g.measured ? baselineSum / g.measured : null, avgLatest: g.measured ? latestSum / g.measured : null }));
  const measured = rows.filter((r) => r.comparison);
  const met = measured.filter((r) => r.metGate).length;
  return {
    gate: {
      ...GATE,
      measured: measured.length,
      met,
      passed: measured.length > 0 && met / measured.length >= GATE.shareOfBusinesses,
      simulated: measured.some((r) => r.comparison.simulated),
    },
    businesses: rows,
    bySector: group('sector'),
    byDistrict: group('district'),
  };
}
