// import "reflect-metadata";
// //
// // import { FabricContractPrivateDataAdapter } from "../../src/contracts/ContractPrivateDataAdapter";
// // import { FabricContractSequence } from "../../src/contracts/FabricContractSequence";
// import { Model, model } from "@decaf-ts/decorator-validation";
// import { privateData } from "../../src/shared/decorators";
// import { prop } from "@decaf-ts/decoration";
//
// @model()
// class PDModel extends Model {
//   @prop()
//   id?: string;
//
//   @privateData("Org1")
//   @prop()
//   secret?: string;
//
//   constructor(data?: Partial<PDModel>) {
//     super(data);
//   }
// }
//
// describe.skip("FabricContractPrivateDataAdapter", () => {
//   it("creates FabricContractSequence with provided collections", async () => {
//     const adapter = new FabricContractPrivateDataAdapter(
//       undefined as any,
//       `alias-${Math.random()}`,
//       ["Org1"]
//     );
//     const seq = await adapter.Sequence({
//       name: "pd-seq",
//       type: Number,
//       incrementBy: 1,
//       startWith: 1,
//       cycle: false,
//     });
//
//     expect(seq).toBeInstanceOf(FabricContractSequence);
//   });
//
//   it.skip("prepare maps model to private collections and composite key", () => {
//     const adapter = new FabricContractPrivateDataAdapter(
//       undefined as any,
//       `alias-${Math.random()}`
//     );
//     const stub = {
//       createCompositeKey: jest
//         .fn()
//         .mockImplementation(
//           (table: string, parts: string[]) => `${table}:${parts.join(":")}`
//         ),
//     };
//     const logger = { for: jest.fn().mockReturnThis(), info: jest.fn() };
//
//     const model = new PDModel({ id: "1", secret: "classified" });
//
//     const prepared = adapter.prepare(model, "id", "pd-table", { stub, logger });
//
//     expect(prepared.id).toBe("pd-table:1");
//     expect(prepared.record).toEqual(
//       expect.objectContaining({
//         Org1: expect.objectContaining({ secret: "classified" }),
//       })
//     );
//   });
// });
