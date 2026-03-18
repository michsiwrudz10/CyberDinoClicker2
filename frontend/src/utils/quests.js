export const QUEST_TEMPLATES = [
  {
    id: "q_clicks",
    title: "click {target} times",
    type: "clicks",
    baseTarget: 200,
    baseReward: { meat: 500 },
    targetGrowth: 1.5,
    rewardGrowth: 1.4
  },
  {
    id: "q_meat",
    title: "collect {target} meat",
    type: "meat",
    baseTarget: 50000, // 500 * 100
    baseReward: { fortunePoints: 1 },
    targetGrowth: 1.6,
    rewardGrowth: 1.5
  },
  {
    id: "q_buy",
    title: "buy {target} dinosaurs",
    type: "buy",
    baseTarget: 1,
    baseReward: { ferns: 1 },
    targetGrowth: 2.0,
    rewardGrowth: 1.6
  }
];

export function computeQuestFromTemplate(template, level = 1) {
  const lvl = Math.max(1, Math.floor(level));
  const target = Math.ceil(template.baseTarget * Math.pow(template.targetGrowth, lvl - 1));
  const reward = {};
  for (const k of Object.keys(template.baseReward)) {
    const base = template.baseReward[k];
    const scaled = Math.floor(base * Math.pow(template.rewardGrowth, lvl - 1));
    reward[k] = Math.max(1, scaled);
  }
  return {
    id: template.id,
    titleTemplate: template.title,
    title: template.title.replace("{target}", target),
    type: template.type,
    level: lvl,
    target,
    progress: 0,
    reward,
  };
}