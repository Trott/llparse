import * as assert from 'assert';
import { Compilation, BasicBlock, INodeID } from '../compilation';
import { Node, INodeChild } from './base';

export class Consume extends Node {
  constructor(id: INodeID, private readonly fieldName: string) {
    super('consume', id);
    this.privNoPrologueCheck = true;
  }

  public doBuild(ctx: Compilation, body: BasicBlock): void {
    const INVARIANT_GROUP = ctx.INVARIANT_GROUP;

    const pos = ctx.pos.current;

    const indexPtr = ctx.stateField(body, this.fieldName);
    const index = body.load(indexPtr);
    index.metadata.set('invariant.group', INVARIANT_GROUP);

    const need = ctx.truncate(body, index, ctx.TYPE_INTPTR);

    const intPos = body.cast('ptrtoint', pos, ctx.TYPE_INTPTR);
    const intEndPos = body.cast('ptrtoint', ctx.endPos, ctx.TYPE_INTPTR);

    const avail = body.binop('sub', intEndPos, intPos);
    const cmp = body.icmp('uge', avail, need);
    const branch = ctx.branch(body, cmp, [ 'likely', 'unlikely' ]);

    const hasData = branch.left;
    const noData = branch.right;
    hasData.name = 'has_data';
    noData.name = 'no_data';

    // Continue!
    const next = hasData.getelementptr(pos, index);

    assert(!this.skip);
    hasData.store(index.ty.val(0), indexPtr)
      .metadata.set('invariant.group', INVARIANT_GROUP);
    this.doOtherwise(ctx, hasData, { current: next, next: null });

    // Pause!
    const left = noData.binop('sub', need, avail);

    const leftTrunc = ctx.truncate(noData, left, index.ty);

    noData.store(leftTrunc, indexPtr)
      .metadata.set('invariant.group', INVARIANT_GROUP);
    this.pause(ctx, noData);
  }
}