// functions/api/siswa.js
export async function onRequestGet(context) {
  const { env } = context;

  try {
    const row = await env.DB.prepare("SELECT 1 AS ok").first();

    return new Response(
      JSON.stringify({
        dbTest: row,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "DB error",
        message: String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
