import { Casco } from './Casco';
import { Esporos } from './Esporos';
import { Filamento } from './Filamento';
import { Membrana } from './Membrana';

export function Creatures() {
  return (
    <>
      <Membrana />
      <Filamento />
      <Casco />
      <Esporos />
    </>
  );
}
