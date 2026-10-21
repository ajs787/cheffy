import { centerSquare } from './images';

jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));

describe('centerSquare', () => {
  it('takes the largest centered square', () => {
    expect(centerSquare(1200, 1600)).toEqual({ originX: 0, originY: 200, width: 1200, height: 1200 });
    expect(centerSquare(1600, 900)).toEqual({ originX: 350, originY: 0, width: 900, height: 900 });
    expect(centerSquare(500, 500)).toEqual({ originX: 0, originY: 0, width: 500, height: 500 });
  });
});
