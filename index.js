import { Composer, Markup, Scenes, session, Telegraf } from 'telegraf';
import { GoogleSpreadsheet } from 'google-spreadsheet';

if (process.env.API_KEY === undefined) {
  throw new Error('BOT_TOKEN must be provided!')
}

const socialNetworks = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  vk: 'VK'
}

const firstKeyboard = async (ctx) => {
  return ctx.replyWithHTML(
    '<b>Please choose social network</b>',
    Markup.keyboard([...Object.values(socialNetworks)])
      .oneTime()
      .resize()
  )
}

const firstStep = new Composer();
firstStep.command('start', async (ctx) => {
  await firstKeyboard(ctx);
  return ctx.wizard.next();
})

const stepHandler = new Composer();
stepHandler.hears(/Facebook|Instagram|VK/, async (ctx) => {
  await ctx.replyWithHTML(
    `<b>You choose: ${ctx.message.text}</b>`,
    Markup.keyboard([['Confirm', '⬅️ Change']])
      .oneTime()
      .resize()
  )
  ctx.wizard.state.socialNetwork = ctx.message.text;
  return ctx.wizard.next();
  // return ctx.wizard.steps[ctx.wizard.cursor](ctx)
})

stepHandler.use((ctx) =>
  ctx.replyWithMarkdown('Please choose social network')
)

const expression = /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)?/gi;
const provideLinkStep = new Composer();
provideLinkStep.hears(/Confirm/, async (ctx) => {
  return await ctx.reply(`Please Enter Link:`)
})
provideLinkStep.hears(/⬅️ Change/, async (ctx) => {
  ctx.wizard.back()
  return await firstKeyboard(ctx);
})
provideLinkStep.hears(expression, async (ctx) => {
  await ctx.reply('Link was added');
  ctx.wizard.state.link = ctx.message.text;
  ctx.wizard.next();
  return ctx.wizard.steps[ctx.wizard.cursor](ctx);
})
provideLinkStep.use((ctx) =>
  ctx.replyWithMarkdown('Please enter valid link')
)

const confirmStep = new Composer();
confirmStep.hears(/Confirm/, async (ctx) => {
  let processing = true;

  const doc = new GoogleSpreadsheet('1W2SY5fXBixxwv_S3pUQ5aHEJ-7L7dzpKKiSVTQ88svc');
  await doc.useServiceAccountAuth({
    client_email: process.env.CLIENT_EMAIL,
    private_key: process.env.PRIVATE_KEY.replace(/\\n/g, "\n"),
  });

  await ctx.reply('processing...')
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();
  const canAdd = rows.length === 0 || !rows.some(row => row.link.includes(ctx.message.text));

  if (canAdd) {
    await sheet.addRow({link: ctx.wizard.state.link})
    await ctx.reply('Done');
    return await ctx.scene.leave();
  } else {
    await ctx.replyWithHTML('Link already exists!');
    return await ctx.scene.leave();
  }
})
confirmStep.hears(/⬅️ Back/, async (ctx) => {
  ctx.wizard.back();
  ctx.wizard.back();
  return ctx.wizard.steps[ctx.wizard.cursor](ctx);
})

const superWizard = new Scenes.WizardScene(
  'super-wizard',
  firstStep,
  stepHandler,
  provideLinkStep,
  async (ctx) => {
    await ctx.replyWithHTML(
      `<b>Please enter or select number of followers:</b>`,
      Markup.keyboard([['0-1000'], ['1000-10000'], ['10000-100000'], ['> 100000'], ['⬅️ Back']])
        .oneTime()
        .resize()
    )

    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.followers = ctx.message.text;
    const {socialNetwork, followers, link} = ctx.wizard.state;

    await ctx.replyWithHTML(
      `<b>Please confirm provided information:</b>
Social Network: <b>${socialNetwork}</b>
Followers: <b>${followers}</b>
Link: <b>${link}</b>`,
      Markup.keyboard([['Confirm', '⬅️ Back']])
        .oneTime()
        .resize()
    )
    return ctx.wizard.next();
  },
  confirmStep
)


const bot = new Telegraf(process.env.API_KEY)
const stage = new Scenes.Stage([superWizard], {
  default: 'super-wizard',
})

// bot.use(Telegraf.log())
bot.use(session())
bot.use(stage.middleware())
bot.launch()

// Enable graceful stop
// process.once('SIGINT', () => bot.stop('SIGINT'))
// process.once('SIGTERM', () => bot.stop('SIGTERM'))
