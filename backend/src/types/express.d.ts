import type { MarketplaceSttPayment } from "../services/marketplace/stt-paywall.js";

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      user: {
        id: string;
        email: string;
      };
      marketplacePayment?: MarketplaceSttPayment;
    }
  }
}

export {};
