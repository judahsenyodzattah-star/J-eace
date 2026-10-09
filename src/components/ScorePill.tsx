export function ScorePill({ score, large = false }: { score: number; large?: boolean }) {
  const tone = score >= 0.85 ? 'high' : score >= 0.6 ? 'mid' : 'low';
  return <span className={`score-pill score-${tone} ${large ? 'score-large' : ''}`}>{Math.round(score * 100)}<small>%</small></span>;
}
