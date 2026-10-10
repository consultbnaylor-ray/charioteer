export type CitedFact = {
  id: string;
  source: string;
  title: string;
  text: string;
  url: string;
  published: string;
};

/**
 * Numbers Thumos is allowed to quote. If a figure is not in this list, the
 * coach must say it does not have a verified figure. Retrieved 10 October 2026.
 */
export const ALCOHOL_FACTS: readonly CitedFact[] = [
  {
    id: 'nhs-14-units',
    source: 'NHS',
    title: '14 units a week',
    text: 'The NHS advises men and women not to drink more than 14 units of alcohol a week on a regular basis. If you drink as much as 14 units a week, spread them over 3 or more days and try to have several drink-free days.',
    url: 'https://www.nhs.uk/live-well/alcohol-advice/the-risks-of-drinking-too-much/',
    published: 'NHS, The risks of drinking too much',
  },
  {
    id: 'nhs-no-safe-level',
    source: 'NHS',
    title: 'Low risk is not safe',
    text: 'The NHS says drinking under 14 units a week is called low risk rather than safe, because there is no safe drinking level. The less you drink, the lower the health risks.',
    url: 'https://www.nhs.uk/live-well/alcohol-advice/the-risks-of-drinking-too-much/',
    published: 'NHS, The risks of drinking too much',
  },
  {
    id: 'nhs-harms',
    source: 'NHS',
    title: 'Health harms named by the NHS',
    text: 'The NHS says drinking more than 14 units a week over many years can increase the risk of mouth cancer, throat cancer and breast cancer, stroke, heart disease, liver disease, and brain damage that may cause memory loss and changes in behaviour. It also says there are strong links between drinking too much and self-harm, including suicide.',
    url: 'https://www.nhs.uk/live-well/alcohol-advice/the-risks-of-drinking-too-much/',
    published: 'NHS, The risks of drinking too much',
  },
  {
    id: 'nhs-withdrawal',
    source: 'NHS',
    title: 'Stopping suddenly can be dangerous',
    text: 'The NHS says it can be very dangerous to stop drinking suddenly if you are dependent on alcohol. Withdrawal symptoms include anxiety, difficulty sleeping, nausea and vomiting, a racing heartbeat, sweating and shaking, hallucinations, confusion, and seizures. They can begin within 6 to 12 hours of the last drink and usually last 3 to 7 days. If you get withdrawal symptoms, get medical help before you try to stop. Call 999 or go to A&E for severe symptoms such as visible shaking, confusion, hallucinations, or a seizure.',
    url: 'https://www.nhs.uk/conditions/alcohol-use-disorder/',
    published: 'NHS, Alcohol-use disorder',
  },
  {
    id: 'ons-2023-deaths',
    source: 'ONS',
    title: 'Alcohol-specific deaths in the UK, 2023',
    text: 'The Office for National Statistics reported that 10,473 deaths from alcohol-specific causes were registered in the UK in 2023, the highest number on record. The rate was 15.9 deaths per 100,000 people, slightly lower than 16.6 per 100,000 in 2022. Alcohol-specific deaths are those wholly caused by alcohol, such as alcoholic liver disease. They do not include every death that alcohol can contribute to, such as some heart disease and cancers.',
    url: 'https://www.ons.gov.uk/peoplepopulationandcommunity/healthandsocialcare/causesofdeath/bulletins/alcoholrelateddeathsintheunitedkingdom/registeredin2023',
    published: 'ONS, Alcohol-specific deaths in the UK: registered in 2023',
  },
  {
    id: 'who-2019',
    source: 'WHO',
    title: 'Global harm, 2019 data',
    text: 'The World Health Organization fact sheet dated 28 June 2024 says around 2.6 million deaths were caused by alcohol consumption in 2019. It says alcohol plays a causal role in more than 200 diseases, injuries and other health conditions, and that there is no form of alcohol consumption that is risk-free.',
    url: 'https://www.who.int/news-room/fact-sheets/detail/alcohol',
    published: 'WHO, Alcohol fact sheet, 28 June 2024',
  },
];

export function factsBlock(): string {
  return ALCOHOL_FACTS.map(
    (fact) => `- [${fact.id}] ${fact.source}: ${fact.text} Source: ${fact.published}. ${fact.url}`,
  ).join('\n');
}
