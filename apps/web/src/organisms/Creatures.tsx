import { Casco } from './Casco';
import { Celula } from './Celula';
import { Filamento } from './Filamento';
import { Membrana } from './Membrana';

export function Creatures() {
  return (
    <>
      <Membrana />
      <Filamento />
      <Casco />
      <Celula />
    </>
  );
}
