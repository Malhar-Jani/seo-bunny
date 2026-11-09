import QRCode from 'qrcode';
import { getBusiness, reviewLink } from '@/lib/growth';
import { guardLocal, GbpError } from '@/lib/gbp/security';
import { failure } from '@/lib/gbp/http';
export async function GET(req: Request) {
    try {
        guardLocal(req);
        const business = await getBusiness(new URL(req.url).searchParams.get('businessId') || '');
        const link = reviewLink(business);
        if (!link) throw new GbpError('MISSING_LINK', 'Add a Google Maps link or Place ID for this business.');
        const svg = await QRCode.toString(link, { type: 'svg', width: 512, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#302d26', light: '#fffdf8' } });
        return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="review-qr.svg"', 'X-Content-Type-Options': 'nosniff' } });
    } catch (e) { return failure(e); }
}
