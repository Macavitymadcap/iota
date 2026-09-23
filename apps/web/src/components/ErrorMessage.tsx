export function ErrorMessage({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <p role="alert" className="error">
      {message}
    </p>
  );
}
