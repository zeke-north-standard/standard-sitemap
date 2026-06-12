import {
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const result = await login(request);
  if (result instanceof Response) return result;
  return { errors: result };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await login(request);
  if (result instanceof Response) return result;
  return { errors: result };
};

export default function Login() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors ?? loaderData.errors;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "48px" }}>
      <h1>Log in to HTML Sitemap Tool</h1>
      <Form method="post">
        <label
          htmlFor="shop"
          style={{ display: "block", fontWeight: 600, marginBottom: 8 }}
        >
          Shopify store domain
        </label>
        <input
          id="shop"
          name="shop"
          placeholder="the-north-standard.myshopify.com"
          style={{
            border: "1px solid #c9cccf",
            borderRadius: 6,
            display: "block",
            fontSize: 16,
            marginBottom: 12,
            maxWidth: 420,
            padding: "10px 12px",
            width: "100%",
          }}
        />
        {errors && typeof errors === "object" && "shop" in errors ? (
          <p style={{ color: "#bf0711" }}>{String(errors.shop)}</p>
        ) : null}
        <button
          type="submit"
          style={{
            background: "#008060",
            border: 0,
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 600,
            padding: "10px 16px",
          }}
        >
          Continue
        </button>
      </Form>
    </main>
  );
}
