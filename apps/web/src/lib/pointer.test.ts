import { isClick } from './pointer';

it('deslocamento de 3 px é clique', () => {
  expect(isClick({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
});

it('deslocamento de 5 px não é clique (arrasto de câmera)', () => {
  expect(isClick({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false);
});

it('usa a distância euclidiana, não a soma dos eixos', () => {
  // 3 px em x e 3 px em y dão 4,24 px: passa do limiar de 4.
  expect(isClick({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false);
});
