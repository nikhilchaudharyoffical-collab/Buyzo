import { Eye, EyeOff, MessageSquareText, Star, Trash2 } from "lucide-react";

export type AdminReview = { id: string; orderId: string; name: string; rating: number; body: string; avatar: string | null; status: "published" | "hidden"; createdAt: string };

const when = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export function ReviewsView({ reviews, loading, error, pending, onVisibility, onDelete }: {
  reviews: AdminReview[]; loading: boolean; error: Error | null; pending: boolean;
  onVisibility: (variables: { id: string; hidden: boolean }) => void; onDelete: (id: string) => void;
}) {
  const live = reviews.filter((review) => review.status === "published").length;
  return (
    <div className="bd-content">
      <div className="bd-page-intro"><div><h2>Customer reviews</h2><p>Reviews go live as soon as a delivered-order customer posts them. Hide anything that doesn't belong, or delete it.</p></div><span className="bd-chip ok">{live} live · {reviews.length - live} hidden</span></div>
      {error ? <div className="bd-state error">{error.message}</div> : loading ? <div className="bd-state">Loading reviews...</div> : !reviews.length ? (
        <div className="bd-empty"><MessageSquareText size={22} /><span>No reviews yet. Customers can review after their order is Delivered.</span></div>
      ) : (
        <div className="bd-rvlist">
          {reviews.map((review) => (
            <article key={review.id} className={`bd-rv ${review.status === "hidden" ? "hidden" : ""}`}>
              {review.avatar ? <img src={review.avatar} alt="" /> : <span className="bd-rv-initial">{review.name.charAt(0)}</span>}
              <div className="bd-rv-main">
                <header>
                  <strong>{review.name}</strong>
                  <span className="bd-rv-stars" aria-label={`${review.rating} stars`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} fill={n <= review.rating ? "currentColor" : "none"} />)}</span>
                  {review.status === "hidden" && <span className="bd-chip bad">Hidden</span>}
                </header>
                <p>{review.body}</p>
                <small>#{review.orderId} · {when(review.createdAt)}</small>
              </div>
              <div className="bd-rv-actions">
                <button className="bd-button secondary compact" disabled={pending} onClick={() => onVisibility({ id: review.id, hidden: review.status === "published" })}>
                  {review.status === "published" ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Show</>}
                </button>
                <button className="bd-icon-button subtle-danger" disabled={pending} aria-label="Delete review" title="Delete review" onClick={() => window.confirm("Delete this review for good?") && onDelete(review.id)}><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
