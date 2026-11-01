import { useState } from "react";
import { BadgeCheck, Star, X } from "lucide-react";
import { type Review, type ReviewData } from "@/lib/reviews";

const PREVIEW_COUNT = 6;
const date = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="rv-stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} fill={n <= Math.round(value) ? "currentColor" : "none"} />)}
    </span>
  );
}

function Avatar({ review }: { review: Review }) {
  return review.avatar
    ? <img className="rv-avatar" src={review.avatar} alt="" loading="lazy" />
    : <span className="rv-avatar rv-initial" aria-hidden="true">{review.name.charAt(0).toUpperCase()}</span>;
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="rv-card">
      <header>
        <Avatar review={review} />
        <div>
          <strong>{review.name}</strong>
          <span className="rv-verified"><BadgeCheck size={13} /> Verified buyer</span>
        </div>
        <time dateTime={review.createdAt}>{date(review.createdAt)}</time>
      </header>
      <Stars value={review.rating} />
      <p>{review.body}</p>
    </article>
  );
}

export function ReviewsSection({ data }: { data: ReviewData & { loaded: boolean } }) {
  const [all, setAll] = useState(false);
  const { summary, reviews } = data;
  if (!data.loaded) return null;

  return (
    <section className="sf-section" id="ratings">
      <h2>Customer reviews</h2>
      {summary.count === 0 ? (
        <p className="rv-empty">No reviews yet. After your order is delivered, you can review it from My orders.</p>
      ) : (
        <>
          <div className="rv-summary">
            <div className="rv-score">
              <strong>{summary.average.toFixed(1)}</strong>
              <Stars value={summary.average} size={16} />
              <span>{summary.count.toLocaleString("en-IN")} review{summary.count === 1 ? "" : "s"}</span>
            </div>
            <ul className="rv-bars" aria-label="Rating breakdown">
              {([5, 4, 3, 2, 1] as const).map((star) => (
                <li key={star}>
                  <span>{star}<Star size={11} fill="currentColor" /></span>
                  <i><b style={{ width: `${(summary.breakdown[String(star) as "1"] / summary.count) * 100}%` }} /></i>
                  <small>{summary.breakdown[String(star) as "1"]}</small>
                </li>
              ))}
            </ul>
          </div>

          <div className="rv-grid">
            {reviews.slice(0, PREVIEW_COUNT).map((review) => <ReviewCard key={review.id} review={review} />)}
          </div>
          {reviews.length > PREVIEW_COUNT && (
            <button type="button" className="rv-all" onClick={() => setAll(true)}>View all {summary.count} reviews</button>
          )}
        </>
      )}

      {all && (
        <div className="modal-backdrop myo-layer" onMouseDown={(event) => event.target === event.currentTarget && setAll(false)}>
          <div className="purchase-modal myo-modal" role="dialog" aria-modal="true" aria-label="All reviews">
            <button className="modal-close" onClick={() => setAll(false)} aria-label="Close"><X size={18} /></button>
            <div className="modal-heading">
              <h2>All reviews</h2>
              <p>{summary.average.toFixed(1)} out of 5 from {summary.count} verified buyer{summary.count === 1 ? "" : "s"}</p>
            </div>
            <div className="rv-list">
              {reviews.map((review) => <ReviewCard key={review.id} review={review} />)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
