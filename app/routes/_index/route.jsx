import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>A short heading about [your app]</h1>
        <p className={styles.text}>
          A tagline about [your app] that describes your value proposition.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}

        {/* One-off offline admin token, for pasting into the server env.
            Sessions live in MemorySessionStorage and do not survive serverless
            cold starts, so the proxy API routes fall back to this token. */}
        <hr style={{ margin: "28px 0", border: 0, borderTop: "1px solid #e5e7eb" }} />
        <h2 style={{ fontSize: 18, margin: "0 0 6px" }}>Generate an admin token</h2>
        <p style={{ fontSize: 14, color: "#475569", margin: "0 0 12px" }}>
          Authorises the app and shows an offline admin token once, to store as{" "}
          <code>SHOPIFY_ACCESS_TOKEN</code>.
        </p>
        <Form className={styles.form} method="get" action="/admin-token/start">
          <label className={styles.label}>
            <span>Shop domain</span>
            <input
              className={styles.input}
              type="text"
              name="shop"
              placeholder="my-shop-domain.myshopify.com"
              required
            />
          </label>
          <button className={styles.button} type="submit">
            Generate token
          </button>
        </Form>
        <ul className={styles.list}>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
        </ul>
      </div>
    </div>
  );
}
