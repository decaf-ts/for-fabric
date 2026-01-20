import { SegregatedModel } from "../types";
import { Constructor } from "@decaf-ts/decoration";
import "@decaf-ts/decorator-validation";
import { CollectionResolver, MirrorMetadata } from "../decorators";

declare module "@decaf-ts/decorator-validation" {
  export interface Model {
    isPrivate<M extends Model>(this: M): boolean;
    isShared<M extends Model>(this: M): boolean;
    segregate<M extends Model>(this: M): SegregatedModel<M>;
  }

  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Model {
    function isPrivate<M extends Model>(model: Constructor<M>): boolean;
    function isShared<M extends Model>(model: Constructor<M>): boolean;
    function segregate<M extends Model>(model: M): SegregatedModel<M>;
    function ownerOf<M extends Model>(model: M): string;
    function mirroredAt<M extends Model>(
      model: M | Constructor<M>
    ): MirrorMetadata | undefined;
    function collectionsFor<M extends Model>(
      model: M | Constructor<M>
    ): {
      privateCols: (string | CollectionResolver)[];
      sharedCols: (string | CollectionResolver)[];
    };
  }
}
