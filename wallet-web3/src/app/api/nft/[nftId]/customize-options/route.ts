import { NextRequest, NextResponse } from 'next/server';

// Opciones de personalización simuladas para cada trait
const traitOptions = {
  Background: {
    currentValue: 'Blue',
    variants: [
      { name: 'Blue', imageUrl: '/assets/traits/BACKGROUND/Blue/blue_bg.png' },
      { name: 'Red', imageUrl: '/assets/traits/BACKGROUND/Red/red_bg.png' },
      { name: 'Green', imageUrl: '/assets/traits/BACKGROUND/Green/green_bg.png' },
      { name: 'Purple', imageUrl: '/assets/traits/BACKGROUND/PURPLE/purple_bg.png' },
      { name: 'Orange', imageUrl: '/assets/traits/BACKGROUND/ORANGE/orange_bg.png' },
      { name: 'Pink', imageUrl: '/assets/traits/BACKGROUND/PINK/pink_bg.png' },
      { name: 'Black', imageUrl: '/assets/traits/BACKGROUND/Black/black_bg.png' },
      { name: 'White', imageUrl: '/assets/traits/BACKGROUND/WHITE/white_bg.png' }
    ]
  },
  Fur: {
    currentValue: 'White',
    variants: [
      { name: 'White', imageUrl: '/assets/traits/FUR/WHITE/white_fur.png' },
      { name: 'Black', imageUrl: '/assets/traits/FUR/BLACK/black_fur.png' },
      { name: 'Golden', imageUrl: '/assets/traits/FUR/GOLDEN/golden_fur.png' },
      { name: 'Blue', imageUrl: '/assets/traits/FUR/BLUE/blue_fur.png' },
      { name: 'Red', imageUrl: '/assets/traits/FUR/RED/red_fur.png' },
      { name: 'Pink', imageUrl: '/assets/traits/FUR/PINK/pink_fur.png' },
      { name: 'Leopard', imageUrl: '/assets/traits/FUR/LEOPARD/leopard_fur.png' },
      { name: 'Robot', imageUrl: '/assets/traits/FUR/ROBOT/robot_fur.png' }
    ]
  },
  Eyes: {
    currentValue: 'Happy',
    variants: [
      { name: 'Happy', imageUrl: '/assets/traits/EYES/HAPPY/happy_eyes.png' },
      { name: 'Laser', imageUrl: '/assets/traits/EYES/LASER/laser_eyes.png' },
      { name: 'Diamond', imageUrl: '/assets/traits/EYES/DIAMOND/diamond_eyes.png' },
      { name: 'Coin', imageUrl: '/assets/traits/EYES/COIN/coin_eyes.png' },
      { name: '3D-Glasses', imageUrl: '/assets/traits/EYES/3D-GLASSES/3d_glasses.png' },
      { name: 'Visor', imageUrl: '/assets/traits/EYES/VISOR/visor_eyes.png' },
      { name: 'Empty', imageUrl: '/assets/traits/EYES/EMPTY/empty_eyes.png' },
      { name: 'Max-Pain', imageUrl: '/assets/traits/EYES/MAX-PAIN/max_pain_eyes.png' }
    ]
  },
  Hat: {
    currentValue: 'None',
    variants: [
      { name: 'None', imageUrl: '/assets/traits/none.png.bmp' },
      { name: 'Crown', imageUrl: '/assets/traits/HAT/GOLD-CROWN/gold_crown.png' },
      { name: 'Halo', imageUrl: '/assets/traits/HAT/HALO/halo.png' },
      { name: 'Horns', imageUrl: '/assets/traits/HAT/HORNS/horns.png' },
      { name: 'Demon-Crown', imageUrl: '/assets/traits/HAT/DEMON-CROWN/demon_crown.png' },
      { name: 'Portal', imageUrl: '/assets/traits/HAT/PORTAL/portal.png' },
      { name: 'Snake', imageUrl: '/assets/traits/HAT/SNAKE/snake.png' },
      { name: 'Tentacles', imageUrl: '/assets/traits/HAT/TENTACLES/tentacles.png' }
    ]
  },
  Tunic: {
    currentValue: 'Blue',
    variants: [
      { name: 'Blue', imageUrl: '/assets/traits/TUNIC/BLUE/blue_tunic.png' },
      { name: 'Red', imageUrl: '/assets/traits/TUNIC/RED/red_tunic.png' },
      { name: 'Green', imageUrl: '/assets/traits/TUNIC/GREEN/green_tunic.png' },
      { name: 'Black', imageUrl: '/assets/traits/TUNIC/BLACK/black_tunic.png' },
      { name: 'White', imageUrl: '/assets/traits/TUNIC/WHITE/white_tunic.png' },
      { name: 'Violet', imageUrl: '/assets/traits/TUNIC/VIOLET/violet_tunic.png' },
      { name: 'Trippy', imageUrl: '/assets/traits/TUNIC/TRIPPY/trippy_tunic.png' }
    ]
  },
  Face: {
    currentValue: 'Normal',
    variants: [
      { name: 'Normal', imageUrl: '/assets/traits/FACE/NORMAL/normal_face.png' },
      { name: 'Angry', imageUrl: '/assets/traits/FACE/ANGRY/angry_face.png' },
      { name: 'Happy', imageUrl: '/assets/traits/FACE/HAPPY/happy_face.png' },
      { name: 'Laugh', imageUrl: '/assets/traits/FACE/LAUGH/laugh_face.png' },
      { name: 'Cigarette', imageUrl: '/assets/traits/FACE/CIGARETTE/cigarette_face.png' },
      { name: 'Diamond', imageUrl: '/assets/traits/FACE/DIAMOND/diamond_face.png' },
      { name: 'Ruby', imageUrl: '/assets/traits/FACE/RUBY/ruby_face.png' },
      { name: 'Ogre', imageUrl: '/assets/traits/FACE/OGRE/ogre_face.png' }
    ]
  },
  Effect: {
    currentValue: 'None',
    variants: [
      { name: 'None', imageUrl: '/assets/traits/none.png.bmp' },
      { name: 'Standard', imageUrl: '/assets/traits/EFFECT/Standart/standard_effect.png' },
      { name: 'Fire', imageUrl: '/assets/traits/EFFECT/FIRE/fire_effect.png' },
      { name: 'Electric', imageUrl: '/assets/traits/EFFECT/ELECTRIC/electric_effect.png' },
      { name: 'Smoke', imageUrl: '/assets/traits/EFFECT/SMOKE/smoke_effect.png' }
    ]
  }
};

export async function GET(
  request: NextRequest,
  { params }: { params: { nftId: string } }
) {
  try {
    const { nftId } = params;

    // Por ahora retornamos todas las opciones disponibles
    // Más adelante se pueden personalizar según el NFT específico
    return NextResponse.json(traitOptions);
  } catch (error) {
    console.error('Error obteniendo opciones de personalización:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' }, 
      { status: 500 }
    );
  }
}
