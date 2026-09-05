import { sql } from '@/lib/db';
import { buildFullAnalysis } from '@/lib/analysis';
import { buildAgeingReport } from '@/lib/ageing';

export async function buildManagementSummaryData(companyId, snapshotId) {
  const [snapshot] = await sql`select * from ar_snapshots where id = ${snapshotId} and company_id = ${companyId}`;
  const analysis = await buildFullAnalysis(companyId, snapshotId);
  const asOfDate = snapshot.report_date_parsed || new Date();
  const ageing = buildAgeingReport(analysis.invoices, asOfDate, 150);

  // Prior snapshot for the same company, so the narrative can speak to trend, not just a snapshot in isolation.
  const [prior] = await sql`
    select * from ar_snapshots
    where company_id = ${companyId} and id != ${snapshotId}
      and (report_date_parsed < ${snapshot.report_date_parsed} or report_date_parsed is null)
    order by report_date_parsed desc nulls last, uploaded_at desc limit 1
  `;
  let comparison = null;
  if (prior) {
    const priorAnalysis = await buildFullAnalysis(companyId, prior.id);
    comparison = {
      priorReportDate: prior.report_date,
      totalDelta: analysis.sectors.total.qb - priorAnalysis.sectors.total.qb,
      gvtDelta: analysis.sectors.gvt.qb - priorAnalysis.sectors.gvt.qb,
      pvtDelta: analysis.sectors.pvt.qb - priorAnalysis.sectors.pvt.qb,
      semiDelta: analysis.sectors.semi.qb - priorAnalysis.sectors.semi.qb,
    };
  }

  return { snapshot, sectors: analysis.sectors, ageing, comparison };
}

function fmt(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/** Data-driven fallback narrative — no external API required, varies with the actual figures every time. */
function ruleBasedNarrative({ companyName, sectors, ageing, comparison, criticalThresholdLabel }) {
  const lines = [];
  lines.push(`Total outstanding for ${companyName} stands at ${fmt(sectors.total.qb)} as of this report, with net outstanding (after payments logged) of ${fmt(sectors.total.net)}.`);

  const sectorEntries = [['GVT', sectors.gvt], ['PVT', sectors.pvt], ['Semi-GVT', sectors.semi]].sort((a, b) => b[1].qb - a[1].qb);
  const [topName, topSector] = sectorEntries[0];
  lines.push(`${topName} is the largest exposure at ${fmt(topSector.qb)} (${(topSector.pct * 100).toFixed(1)}% of total).`);

  if (comparison) {
    const dir = comparison.totalDelta >= 0 ? 'increased' : 'decreased';
    lines.push(`Compared to the previous report (${comparison.priorReportDate}), total outstanding has ${dir} by ${fmt(Math.abs(comparison.totalDelta))}.`);
    const deltas = [['GVT', comparison.gvtDelta], ['PVT', comparison.pvtDelta], ['Semi-GVT', comparison.semiDelta]].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const [biggestMoveSector, biggestMove] = deltas[0];
    if (Math.abs(biggestMove) > 0.01) {
      lines.push(`The largest movement was in ${biggestMoveSector}, which ${biggestMove >= 0 ? 'grew' : 'shrank'} by ${fmt(Math.abs(biggestMove))}.`);
    }
  }

  const overdueBuckets = ['91 or more days past due', '61 - 90 days past due'];
  const overdueTotal = overdueBuckets.reduce((s, b) => s + (ageing.buckets[b]?.open || 0), 0);
  if (overdueTotal > 0) {
    lines.push(`${fmt(overdueTotal)} is currently more than 60 days past due, which warrants active follow-up.`);
  }

  if (ageing.critical.length) {
    const criticalTotal = ageing.critical.reduce((s, i) => s + Number(i.open_balance), 0);
    const uniqueCustomers = new Set(ageing.critical.map((i) => i.customer_name_raw)).size;
    lines.push(`CRITICAL: ${ageing.critical.length} invoice(s) totaling ${fmt(criticalTotal)} across ${uniqueCustomers} customer(s) are more than ${criticalThresholdLabel} overdue and should be escalated immediately — see the Critical Matters table below.`);
  } else {
    lines.push(`No invoices are currently overdue by more than ${criticalThresholdLabel} — no critical ageing escalations this period.`);
  }

  return lines.join(' ');
}

/** Calls Claude to write the narrative if ANTHROPIC_API_KEY is set; otherwise falls back to the rule-based version. */
export async function generateNarrative({ companyName, sectors, ageing, comparison }) {
  const criticalThresholdLabel = '5 months';
  const fallback = () => ruleBasedNarrative({ companyName, sectors, ageing, comparison, criticalThresholdLabel });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { narrative: fallback(), aiGenerated: false };

  try {
    const criticalSample = ageing.critical.slice(0, 15).map((i) => ({
      customer: i.customer_name_raw, invoice: i.number, dueDate: i.due_date, daysPastDue: i.daysPastDue, openBalance: Number(i.open_balance),
    }));
    const payload = {
      companyName,
      sectors: {
        GVT: { outstanding: sectors.gvt.qb, net: sectors.gvt.net, pctOfTotal: sectors.gvt.pct },
        PVT: { outstanding: sectors.pvt.qb, net: sectors.pvt.net, pctOfTotal: sectors.pvt.pct },
        'Semi-GVT': { outstanding: sectors.semi.qb, net: sectors.semi.net, pctOfTotal: sectors.semi.pct },
        Total: { outstanding: sectors.total.qb, net: sectors.total.net },
      },
      ageingBuckets: Object.fromEntries(Object.entries(ageing.buckets).map(([k, v]) => [k, { open: v.open, count: v.invoices.length }])),
      criticalInvoicesOver5Months: criticalSample,
      comparisonToPriorReport: comparison,
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: `You are writing the executive summary section of an Accounts Receivable management report for a company's finance director. Base every claim strictly on this JSON data (do not invent figures):\n\n${JSON.stringify(payload, null, 2)}\n\nWrite 3-5 short paragraphs (no headers, no bullet lists, no markdown) covering: (1) overall outstanding position and net position, (2) which sector dominates and why that matters, (3) the trend vs the prior report if comparison data is present, (4) a direct, plain-language call-out of the critical overdue invoices (5+ months) if any exist — name the worst offenders by customer and amount. Be concise, factual, and direct — this is for a busy executive, not a narrative essay.`,
        }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim();
    return { narrative: text || fallback(), aiGenerated: !!text };
  } catch (e) {
    return { narrative: fallback(), aiGenerated: false, aiError: e.message };
  }
}
