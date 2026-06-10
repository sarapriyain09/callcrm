export default function StatCard({ label, value, tone = 'default' }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </article>
  );
}
