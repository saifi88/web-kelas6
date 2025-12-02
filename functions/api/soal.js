export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const mapelId = url.searchParams.get("mapel_id");

  if (!mapelId) {
    return new Response(JSON.stringify({ error: "mapel_id wajib" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { results } = await env.DB.prepare(
    `SELECT 
       id,
       nomor,
       soal,
       a,
       b,
       c,
       d
     FROM soal
     WHERE mapel_id = ?
     ORDER BY nomor ASC`
    // kalau mau acak: ORDER BY RANDOM()
  )
    .bind(mapelId)
    .all();

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
}