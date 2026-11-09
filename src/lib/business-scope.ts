/** Explicit saved-business links only; never guess ownership from similar names. */
export function businessScope(req?: Request) {
    const id = req ? new URL(req.url).searchParams.get('businessId') : null;
    return id ? { savedBusinessId: id } : {};
}
