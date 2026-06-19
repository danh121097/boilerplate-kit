import { signHmac, signSocketHmac } from "@/__tests__/helpers/hmac-sign";
import { socketHmac } from "@/socket/hmac-middleware";
import { describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io";

/**
 * Handshake HMAC gate: accept a correctly-signed { sig, ctime } in the auth
 * payload (GET + application/json + /socket), reject missing/invalid signatures.
 */

function fakeSocket(auth: Record<string, unknown>): Socket {
  return { handshake: { auth } } as unknown as Socket;
}

describe("socketHmac", () => {
  it("accepts a valid socket handshake signature", () => {
    const next = vi.fn();
    socketHmac(fakeSocket({ ...signSocketHmac() }), next);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects when sig/ctime are missing", () => {
    const next = vi.fn();
    socketHmac(fakeSocket({}), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("rejects a tampered signature", () => {
    const next = vi.fn();
    const { ctime } = signSocketHmac();
    socketHmac(fakeSocket({ sig: "AAAAtampered", ctime }), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("rejects a signature for a different path/content", () => {
    const next = vi.fn();
    // Signed for GET /wrong with empty content-type → mismatches the socket contract.
    socketHmac(fakeSocket({ ...signHmac("GET", "/wrong") }), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
