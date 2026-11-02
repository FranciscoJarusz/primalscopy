// Buscadores y crawlers de IA: recorren todo el sitemap y no muestran la
// imagen para compartir, asi que no tiene sentido generarla para ellos. X,
// Discord y Telegram no estan: esos si la usan y conviene tenerla lista.
const BUSCADORES =
    /googlebot|google-inspectiontool|bingbot|yandex|baiduspider|duckduckbot|applebot|ahrefsbot|semrushbot|mj12bot|petalbot|dotbot|bytespider|amazonbot|gptbot|oai-searchbot|claudebot|ccbot|perplexitybot|meta-externalagent/i;

export const esBuscador = (request: Request) =>
    BUSCADORES.test(request.headers.get('user-agent') ?? '');
