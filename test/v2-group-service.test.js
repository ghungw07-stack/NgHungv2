import assert from "node:assert/strict";
import test from "node:test";
import { GroupService } from "../src-v2/modules/groups/service.js";

test("group service normalizes group data and caches requests", async () => {
  let calls = 0;
  const client = { api: { async getGroupInfo(id) {
    calls++;
    return { gridInfoMap: { [id]: { name: "Test", creatorId: 1, adminIds: [2], memVerList: ["1_0", "2_0"] } } };
  } } };
  const groups = new GroupService(client);
  const first = await groups.info("group");
  const second = await groups.info("group");
  assert.equal(first.name, "Test");
  assert.deepEqual(first.memberIds, ["1", "2"]);
  assert.equal(await groups.isAdmin("group", "2"), true);
  assert.equal(second, first);
  assert.equal(calls, 1);
});
