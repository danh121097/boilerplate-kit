import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

// DI metadata gate: NestJS constructor injection depends on `emitDecoratorMetadata`.
// Vitest's default esbuild transform drops that metadata; `unplugin-swc` re-emits it.
// If this test fails to resolve `Consumer.dep`, the SWC/Vitest config is broken —
// fix it before relying on any provider in tests.
@Injectable()
class Dependency {
  readonly value = "injected";
}

@Injectable()
class Consumer {
  constructor(readonly dep: Dependency) {}
}

describe("DI metadata gate (unplugin-swc)", () => {
  it("resolves constructor-injected providers in Test.createTestingModule", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [Dependency, Consumer],
    }).compile();

    const consumer = moduleRef.get(Consumer);
    expect(consumer.dep).toBeInstanceOf(Dependency);
    expect(consumer.dep.value).toBe("injected");
  });
});
