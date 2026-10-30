import { Casco } from './Casco';
import { Celula } from './Celula';
import { Filamento } from './Filamento';
import { Membrana } from './Membrana';
import { Poliedro } from './Poliedro';

export function Creatures() {
  return (
    <>
      <Membrana />
      <Filamento />
      <Casco />
      <Celula />
      <Poliedro />
    </>
  );
}
