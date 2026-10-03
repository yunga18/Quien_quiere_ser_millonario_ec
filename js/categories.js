export const DEFAULT_CATEGORY = 'ecuador';
export const CATEGORIES = [
  { id: 'ecuador', name: 'Ecuador', description: 'Nuestro país: lugares, tradiciones, personajes y grandes momentos.' },
  { id: 'general', name: 'Cultura general', description: 'Un viaje por el conocimiento del mundo: cinco temas diferentes.' },
  { id: 'geography', name: 'Geografía', description: 'Capitales, países, océanos y paisajes de Ecuador y el mundo.' },
  { id: 'history', name: 'Historia', description: 'Civilizaciones, acontecimientos y personajes que dejaron huella.' },
  { id: 'science', name: 'Ciencias', description: 'Naturaleza, espacio, física, química y biología.' },
  { id: 'sports', name: 'Deportes', description: 'Disciplinas, campeones y momentos históricos del deporte.' },
  { id: 'arts', name: 'Arte y literatura', description: 'Libros, pintura, música y patrimonio cultural.' },
  { id: 'mixed', name: 'Todo mezclado', description: 'El desafío completo: Ecuador y cultura general juntos.' },
];

export const getCategory = id => CATEGORIES.find(category => category.id === id);
export function filterQuestions(bank, category = DEFAULT_CATEGORY) {
  if (!getCategory(category)) throw new Error('La categoría no existe.');
  if (category === 'mixed') return bank;
  if (category === 'ecuador' || category === 'general') return bank.filter(q => q.scope === category);
  return bank.filter(q => q.topic === category);
}

const ECUADOR_TOPICS = {
  'Geografía': 'geography', 'Ciudades': 'geography',
  'Historia': 'history', 'Arqueología': 'history', 'Constitución': 'history',
  'Naturaleza': 'science', 'Ciencia': 'science', 'Geología': 'science',
  'Deportes': 'sports',
  'Literatura': 'arts', 'Arte': 'arts', 'Poesía': 'arts', 'Música': 'arts', 'Cultura': 'arts',
};
// Country-only subjects such as gastronomy and national symbols remain in
// Ecuador and mixed games, without entering unrelated specialist categories.
export const ecuadorTopic = category => ECUADOR_TOPICS[category] || 'ecuador';
