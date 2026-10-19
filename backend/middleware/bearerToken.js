// El token del header "Authorization: Bearer <token>", o '' si no viene. Lo
// usan las dos guardas: la del admin y la de la sesion de wallet.

function bearerToken(req) {
    const header = req.get('authorization') || '';
    if (header.toLowerCase().startsWith('bearer ')) {
        return header.slice(7).trim();
    }
    return '';
}

module.exports = { bearerToken };
