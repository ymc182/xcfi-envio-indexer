import assert from "node:assert";
import { TestHelpers, type XToken_Deposit, type XToken_Withdraw } from "generated";

const { MockDb, XToken } = TestHelpers;

describe("XToken Deposit event", () => {
  it("creates a XToken_Deposit entity with lowercased addresses", async () => {
    const mockDb = MockDb.createMockDb();
    const event = XToken.Deposit.createMockEvent({
      sender: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      owner: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      assets: 1_000_000_000_000_000_000n,
      shares: 1_000_000_000_000_000_000n,
    });

    const mockDbUpdated = await XToken.Deposit.processEvent({ event, mockDb });

    const entityId = `${event.chainId}_${event.block.number}_${event.logIndex}`;
    const actual = mockDbUpdated.entities.XToken_Deposit.get(entityId);

    const expected: XToken_Deposit = {
      id: entityId,
      sender: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      owner: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      assets: 1_000_000_000_000_000_000n,
      shares: 1_000_000_000_000_000_000n,
      blockNumber: BigInt(event.block.number),
    };
    assert.deepEqual(actual, expected);
  });
});

describe("XToken Withdraw event", () => {
  it("creates a XToken_Withdraw entity with lowercased addresses", async () => {
    const mockDb = MockDb.createMockDb();
    const event = XToken.Withdraw.createMockEvent({
      sender: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      receiver: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
      owner: "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
      assets: 5_000_000_000_000_000_000n,
      shares: 5_000_000_000_000_000_000n,
    });

    const mockDbUpdated = await XToken.Withdraw.processEvent({ event, mockDb });

    const entityId = `${event.chainId}_${event.block.number}_${event.logIndex}`;
    const actual = mockDbUpdated.entities.XToken_Withdraw.get(entityId);

    const expected: XToken_Withdraw = {
      id: entityId,
      sender: "0xcccccccccccccccccccccccccccccccccccccccc",
      receiver: "0xdddddddddddddddddddddddddddddddddddddddd",
      owner: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      assets: 5_000_000_000_000_000_000n,
      shares: 5_000_000_000_000_000_000n,
      blockNumber: BigInt(event.block.number),
    };
    assert.deepEqual(actual, expected);
  });
});
