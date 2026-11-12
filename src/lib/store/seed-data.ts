import type { SessionData } from "@/types/domain";

/**
 * Generates an isolated, realistic seed dataset for Northside AV & Cinema Rentals.
 * Uses synthetic customer profiles (NFR-014) and integer-cent amounts (BR-001).
 */
export function createInitialSessionState(sessionId: string): SessionData {
  const now = new Date().toISOString();

  return {
    sessionId,
    createdAt: now,
    updatedAt: now,
    customers: [
      {
        id: "cust_alex_rivera",
        name: "Alex Rivera",
        company: "CinemaPulse Productions",
        email: "alex.rivera@example.com",
        paypalVaultStatus: "vaulted",
        riskTier: "A",
      },
      {
        id: "cust_david_chen",
        name: "David Chen",
        company: "Horizon Commercial",
        email: "david.chen@example.com",
        paypalVaultStatus: "vaulted",
        riskTier: "A",
      },
      {
        id: "cust_marcus_vance",
        name: "Marcus Vance",
        company: "Indie Reel Studios",
        email: "marcus.vance@example.com",
        paypalVaultStatus: "none",
        riskTier: "B",
      },
    ],
    assets: [
      {
        id: "asset_fx6_unit_1",
        name: "Sony FX6 Cinema Kit Unit #1",
        category: "Cinema Cameras",
        serialNumber: "FX6-90218",
        dailyRateCents: 37500,
        replacementValueCents: 1500000,
        status: "available",
        model: "Sony FX6 Full-Frame",
      },
      {
        id: "asset_fx6_unit_2",
        name: "Sony FX6 Backup Unit #2",
        category: "Cinema Cameras",
        serialNumber: "FX6-90244",
        dailyRateCents: 37500,
        replacementValueCents: 1500000,
        status: "available",
        model: "Sony FX6 Full-Frame",
      },
      {
        id: "asset_aputure_600d",
        name: "Aputure LS 600d Pro Light Kit",
        category: "Lighting",
        serialNumber: "AP-600D-112",
        dailyRateCents: 18500,
        replacementValueCents: 420000,
        status: "available",
        model: "Aputure 600d Pro",
      },
      {
        id: "asset_sound_833",
        name: "Sound Devices 833 Field Mixer Kit",
        category: "Audio",
        serialNumber: "SD-833-409",
        dailyRateCents: 22000,
        replacementValueCents: 850000,
        status: "available",
        model: "Sound Devices 833",
      },
    ],
    bookings: [
      {
        id: "BK-9021",
        assetId: "asset_fx6_unit_1",
        customerId: "cust_alex_rivera",
        startDate: "2026-11-11T09:00:00.000Z",
        endDate: "2026-11-13T14:00:00.000Z",
        rentalFeeCents: 75000,
        depositHoldCents: 150000,
        authStatus: "pending",
        scheduleStatus: "tentative",
      },
      {
        id: "BK-9024",
        assetId: "asset_fx6_unit_1",
        customerId: "cust_david_chen",
        startDate: "2026-11-14T09:00:00.000Z",
        endDate: "2026-11-16T18:00:00.000Z",
        rentalFeeCents: 75000,
        depositHoldCents: 150000,
        authStatus: "authorized",
        parentTransactionId: "bt_seed_auth_9024",
        scheduleStatus: "confirmed",
      },
      {
        id: "BK-9022",
        assetId: "asset_aputure_600d",
        customerId: "cust_marcus_vance",
        startDate: "2026-11-11T10:00:00.000Z",
        endDate: "2026-11-12T18:00:00.000Z",
        rentalFeeCents: 18500,
        depositHoldCents: 200000,
        authStatus: "pending",
        scheduleStatus: "tentative",
      },
    ],
    transactions: [
      {
        id: "txn_seed_9024",
        braintreeId: "bt_seed_auth_9024",
        bookingId: "BK-9024",
        customerId: "cust_david_chen",
        type: "auth_hold",
        paymentMethod: "PayPal",
        amountCents: 150000,
        signedAmountCents: 0,
        status: "authorized",
        createdAt: "2026-11-10T11:30:00.000Z",
      },
    ],
    inspections: [
      {
        id: "insp_bk_9021",
        bookingId: "BK-9021",
        assetId: "asset_fx6_unit_1",
        inspectorVerified: false,
        items: [
          {
            id: "item_fx6_body",
            itemName: "Sony FX6 Body SN:90218",
            type: "ok",
            evidenceNotes: "Sensor clean, ND filter & mount verified at handover.",
            needsMaintenance: false,
            inspectorVerified: false,
            priceSource: "channel3",
          },
          {
            id: "item_gm_lens",
            itemName: "Sony 24-70mm GM II Lens",
            type: "ok",
            evidenceNotes: "Front element & zoom ring intact at handover.",
            needsMaintenance: false,
            inspectorVerified: false,
            priceSource: "channel3",
          },
          {
            id: "item_ntg5_mic",
            itemName: "Rode NTG5 Shotgun Microphone",
            type: "ok",
            evidenceNotes:
              "Handover kit included XLR mount and pistol grip in Pelican bay.",
            needsMaintenance: false,
            inspectorVerified: false,
            priceSource: "channel3",
          },
          {
            id: "item_sdxc",
            itemName: "SanDisk 128GB Extreme PRO SDXC Card",
            type: "ok",
            evidenceNotes: "Qty: 2 cards in Pelican slot A & slot B at handover.",
            needsMaintenance: false,
            inspectorVerified: false,
            priceSource: "channel3",
          },
        ],
      },
    ],
    disputes: [],
    maintenanceBlocks: [],
    eventLog: [
      {
        id: "evt_seed_init",
        timestamp: now,
        actorRole: "System / AI",
        action: "SESSION_SEEDED",
        entityType: "booking",
        entityId: "BK-9021",
        metadata: {
          facility: "Northside AV & Cinema Rentals",
          bookingsSeeded: 3,
          assetsSeeded: 4,
        },
      },
    ],
  };
}

