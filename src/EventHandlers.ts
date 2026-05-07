import { XToken, type XToken_Deposit, type XToken_Withdraw } from "generated";

XToken.Deposit.handler(async ({ event, context }) => {
  const entity: XToken_Deposit = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    sender: event.params.sender.toLowerCase(),
    owner: event.params.owner.toLowerCase(),
    assets: event.params.assets,
    shares: event.params.shares,
    blockNumber: BigInt(event.block.number),
  };

  context.XToken_Deposit.set(entity);
});

XToken.Withdraw.handler(async ({ event, context }) => {
  const entity: XToken_Withdraw = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    sender: event.params.sender.toLowerCase(),
    receiver: event.params.receiver.toLowerCase(),
    owner: event.params.owner.toLowerCase(),
    assets: event.params.assets,
    shares: event.params.shares,
    blockNumber: BigInt(event.block.number),
  };

  context.XToken_Withdraw.set(entity);
});
