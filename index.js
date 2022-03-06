import { Composer, Markup, Scenes, session, Telegraf } from 'telegraf';
import { GoogleSpreadsheet } from 'google-spreadsheet';

if (process.env.API_KEY === undefined) {
  throw new Error('BOT_TOKEN must be provided!')
}

const socialNetworks = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  vk: 'VK',
  YouTube: 'YouTube',
  TikTok: 'TikTok',
  Telegram: 'Telegram'
}

const resetScene = async (ctx) => {
  await ctx.scene.leave();
  return ctx.scene.enter('super-wizard');
}

const firstKeyboard = async (ctx) => {
  return ctx.replyWithHTML(
    '<b>Please choose social network</b>',
    Markup.keyboard(Object.values(socialNetworks))
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
stepHandler.hears(/Facebook|Instagram|VK|YouTube|TikTok|Telegram/, async (ctx) => {
  ctx.wizard.state.socialNetwork = ctx.message.text;
  return await ctx.replyWithHTML(
    `You choose: <b>${ctx.message.text}</b>. Confirm?`,
    Markup.keyboard([['Confirm']])
      .oneTime()
      .resize()
  )

  // return ctx.wizard.steps[ctx.wizard.cursor].handler(ctx)
})
stepHandler.hears(/Confirm/, async (ctx) => {
  await ctx.wizard.next();
  return ctx.wizard.steps[ctx.wizard.cursor].handler(ctx);
})
stepHandler.command('start', async (ctx) => {
  return resetScene(ctx);
})
stepHandler.use((ctx) => {
  const msg = ctx.wizard.state.socialNetwork ? 'Please confirm social network' : 'Please choose social network';
  return ctx.replyWithMarkdown(msg);
})
/*handleBack.hears(/⬅️ Change/, async (ctx) => {
  ctx.wizard.back();
  ctx.wizard.back();
  return ctx.wizard.steps[ctx.wizard.cursor].handler(ctx);
})*/

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
  ctx.wizard.state.link = ctx.message.text;
  ctx.wizard.next();
  return ctx.wizard.steps[ctx.wizard.cursor].handler(ctx);
})
provideLinkStep.command('start', async (ctx) => {
  return resetScene(ctx);
})
provideLinkStep.use((ctx) =>
  ctx.replyWithMarkdown('Please enter valid link')
)

const confirmStep = new Composer();
confirmStep.hears(/Confirm/, async (ctx) => {
  if (!ctx.wizard.state.processing) {
    ctx.wizard.state.processing = true;

    const doc = new GoogleSpreadsheet('1W2SY5fXBixxwv_S3pUQ5aHEJ-7L7dzpKKiSVTQ88svc');
    await doc.useServiceAccountAuth({
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, "\n"),
    });

    await ctx.reply('processing...')
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    const canAdd = rows.length === 0 || !rows.some(row => row['Link'] === ctx.wizard.state.link);

    if (canAdd) {
      await sheet.addRow({
        ['Network']: ctx.wizard.state.socialNetwork,
        ['Link']: ctx.wizard.state.link,
        ['Followers']: ctx.wizard.state.followers,
        ['Details']: ctx.wizard.state.details
      })
      await ctx.reply('✅ Done');
      ctx.wizard.state.processing = false;
      await ctx.scene.leave();
      return ctx.reply('Please click on /start if you want to add more links');
    } else {
      await ctx.reply('❌ Link already exists!');
      await ctx.scene.leave();
      return ctx.reply('Please click on /start if you want to add another link');
      /*await ctx.reply('Please enter another link:');
      confirmStep.hears(expression, async () => {
        ctx.wizard.state.link = ctx.message.text;
        ctx.wizard.next();
        return ctx.wizard.steps[ctx.wizard.cursor].handler(ctx);
      })*/
      // await ctx.wizard.back();
      // await ctx.wizard.back();
      // await ctx.wizard.back();
      // return ctx.wizard.steps[ctx.wizard.cursor].handler(ctx);
    }
  }
})
/*confirmStep.hears(/⬅️ Back/, async (ctx) => {
  ctx.wizard.back();
  ctx.wizard.back();
  return ctx.wizard.steps[ctx.wizard.cursor](ctx);
})*/

confirmStep.command('start', async (ctx) => {
  return resetScene(ctx)
})

const numberOfFollowers = {
  0: '0-1000',
  1: '1000-10000',
  2: '10000-100000',
  3: '> 100000',
  /*4: '⬅️ Back',*/
}

const followersStep = new Composer();
followersStep.hears(/0-1000|1000-10000|10000-100000|> 100000|[0-9]+/, async (ctx) => {
  await ctx.wizard.next();
  return ctx.wizard.steps[ctx.wizard.cursor].handler(ctx);
})
followersStep.command('start', async (ctx) => {
  return resetScene(ctx)
})

followersStep.use(async (ctx) => {
  return await ctx.replyWithHTML(
    `<b>Please enter or select number of followers:</b>`,
    Markup.keyboard(Object.values(numberOfFollowers))
      .oneTime()
      .resize()
  )
})
const detailsStep = new Composer();
detailsStep.on('text', async (ctx) => {
  await ctx.reply('Provide additional details:')
  ctx.wizard.state.followers = ctx.message.text;
  ctx.wizard.next();
})

const finalizeStep = new Composer();
finalizeStep.hears(/Confirm/, async (ctx) => {
  ctx.wizard.next();
  return ctx.wizard.steps[ctx.wizard.cursor].handler(ctx);
})
finalizeStep.command('start', async (ctx) => {
  return resetScene(ctx)
})
finalizeStep.use(async (ctx) => {
  ctx.wizard.state.details = ctx.message.text;
  const {socialNetwork, followers, link, details = ''} = ctx.wizard.state;

  return await ctx.replyWithHTML(
    `<b>Please confirm provided information:</b>
Social Network: <b>${socialNetwork}</b>
Followers: <b>${followers}</b>
Details: <b>${details}</b>
Link: <b>${link}</b>`,
    Markup.keyboard([['Confirm']])
      .oneTime()
      .resize()
  )
})

const superWizard = new Scenes.WizardScene(
  'super-wizard',
  firstStep,
  stepHandler,
  provideLinkStep,
  followersStep,
  detailsStep,
  finalizeStep,
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
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
