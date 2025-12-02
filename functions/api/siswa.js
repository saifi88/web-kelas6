// functions/api/siswa.js
export async function onRequestGet(context) {
  return new Response(JSON.stringify({ ok: true, source: "siswa.js" }), {
    headers: { "Content-Type": "application/json" },
  });
}
