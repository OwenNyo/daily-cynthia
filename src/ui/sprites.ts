import { Dex, toID } from '@pkmn/sim';

// PokeAPI ids above 10000 for alternate formes (https://pokeapi.co/api/v2/pokemon/<id>).
export const POKEAPI_IDS: Record<string, number> = {
  'Deoxys-Attack': 10001, 'Deoxys-Defense': 10002, 'Deoxys-Speed': 10003,
  'Wormadam-Sandy': 10004, 'Wormadam-Trash': 10005, 'Shaymin-Sky': 10006, 'Giratina-Origin': 10007,
  'Rotom-Heat': 10008, 'Rotom-Wash': 10009, 'Rotom-Frost': 10010, 'Rotom-Fan': 10011, 'Rotom-Mow': 10012,
  'Castform-Sunny': 10013, 'Castform-Rainy': 10014, 'Castform-Snowy': 10015,
};

// Suffix file names in public/sprites/{front,back}/ (PokeAPI Platinum folder listing).
export const FORME_FILES: ReadonlySet<string> = new Set([
  ...'a b c d e f g h i j k l m n o p q r s t u v w x y z exclamation question'.split(' ').map(f => `201-${f}`),
  '412-plant', '412-sandy', '412-trash', '421-overcast', '421-sunshine',
  '422-east', '422-west', '423-east', '423-west',
  ...'bug dark dragon electric fighting fire flying ghost grass ground ice normal poison psychic rock steel unknown water'
    .split(' ').map(t => `493-${t}`),
]);

const dex = Dex.forGen(4);

export function spritePath(species: string, back: boolean): string {
  const s = dex.species.get(species);
  const forme = `${s.num}-${toID(s.forme)}`;
  const file = POKEAPI_IDS[s.name] ?? (s.forme && FORME_FILES.has(forme) ? forme : s.num);
  return `/sprites/${back ? 'back' : 'front'}/${file}.png`;
}
