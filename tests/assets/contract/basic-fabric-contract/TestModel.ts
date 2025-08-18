import { Object as FabricObject, Property } from 'fabric-contract-api';

@FabricObject()
export class TestModel {
  @Property()
  public name!: string;

  @Property()
  public nif!: string;

  constructor(args?: TestModel) {
    this.name = args?.name || '';
    this.nif = args?.nif || '';
  }
}