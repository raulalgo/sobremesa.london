---
number: "027"
title: "Heavy duty"
subtitle: "When we move from designing products to designing tools."
date: "2026-07-16"
slug: "027-heavy-duty"
url: "https://designsobremesa.substack.com/p/027-heavy-duty"
wordcount: 1148
---

### Rambling 1. Weightlifting

For ages I had told myself that the thing keeping me from the art of photography was having the right camera. My father heard that countless times and in 2023 found his excuse.

> I want to get the best photos of my granddaughter.

During that year I was able to try two wonderful mirror-less cameras. Both of them by the firm formerly known as Olympus. First, the [OM-5](https://explore.omsystem.com/us/en/om-5). It was a great camera for an amateur. It would promise things like fitting in the pocket of your coat—it did. Ideal to carry everywhere, with interchangeable lenses, a lot of fancy tricks when processing the images. And then there were the looks. Made to resemble its counterparts from the film era. In silver it made me feel the hipster-est while taking a photo of my own reflection in a cafe.

![](https://substackcdn.com/image/fetch/$s_!r6hY!,w_2400,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F627e847b-c1f3-4b56-b5f5-f2bedf6d7aa8_1376x768.png)
_OM-5 by OM-SYSTEMS_

Eventually we graduated to the [OM-1](https://explore.omsystem.com/us/en/om-1-mark-ii), a completely different beast. Black, bigger, heavier, and with a proper grip. It would make me feel self-conscious. It looks so pro that when I pulled it out people would ask “wait, are you an actual photographer?” After the [Formula 1](https://designsobremesa.substack.com/p/020-redesigning-the-wheel), this is my second go-to example of the difference between consumer and professional products. Consumer products can sell you a story, an aspiration; they can make you feel like someone you are not; they can be the accessory that turns you into your desired self.

Then there are the professional tools. Those just have to deliver. Much less sexy. They won’t take many pages in the canon because their promise is much more basic. They will continue to do their job even after taking a beating. The key function that shapes the OM-1’s form is surviving a fall. Not one, but many; into mud, sand, or ice; under merciless sun or torrential rain. It will be bumped, mishandled and mistreated but it has to keep working. The [Henry](https://designsobremesa.substack.com/p/012-the-sound-of-our-own-voice) and the [Toyota Hilux](https://www.youtube.com/watch?v=xnWKz7Cthkk) make a bit more sense, after all.

### Inspiration 1. Designer, In Japan

Anton, author of Half of Eight, started off with a photo journal that by complementing it with more and more CGI turned into the Design Journal—[or half of it](https://halfof8.com/book)—which can be enjoyed as a book or online, in [a website that deserves a long browse](https://halfof8.com/journal). Now the gods of YouTube have been kind enough to send his channel—[Designer, In Japan](https://www.youtube.com/@halfof8)—my way.

With the title “I built my own motion graphics app”, I was expecting to find another creative that has recently discovered vibe coding and can’t wait to share what he built over the weekend. I clicked out of curiosity on the n-th iteration of a technique that is now almost second nature to many of us—in the [AI fluency ladder](https://designsobremesa.substack.com/p/021-the-ai-fluency-ladder) it would be level 2: “using AI to produce outputs.”

However if, like me, you are interested in climbing the ladder, this is a great example of attacking a repetitive workflow. Anton has done more than “his own motion graphics app.” He’s dissected all the steps it would normally take him to produce the titles for each of his videos. He has identified the right tool that would help him in each step—from a Figma plugin to a Blender one—and has found a way to orchestrate all of them together.

These kinds of tasks that I have to do regularly—like editing a newsletter, for example—are the ones that I dread the most. They have both the ‘i-have-to-do-this-again’ feeling and the periodicity that will keep you coming back to the same problems so regularly that you can start figuring out how you can automate each step best.

### Share 1. The newsroom, a freebie

We kicked off at Viooh our big AI enablement initiative, which will have us trying to get the product team to climb up the ladder. “Using more AI” is no longer enough. We’ve spent one year vibe-coding, now it is time to think of skills and agents.

As an example, I’m also sharing today the orchestrator and skills I’m using in every issue of this newsletter: [the-newsroom](https://github.com/raulalgo/the-newsroom). If you are also writing regularly, feel free to check, download, copy and—most important—customize them to make them your own. And if not, have a look at how each of these steps came to be so you can start thinking of your own.

![](https://substackcdn.com/image/fetch/$s_!qa9t!,w_2400,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fd6d87d1d-df63-49cf-822f-fa2efd1c5d28_3840x2160.png)

1.  `proofread`: For the first five issues I was copying and pasting between [Obsidian](https://obsidian.md/), [Gemini](https://gemini.google.com/) and Substack. English is my second language so that was always my biggest worry. When I started learning about skills myself I could package the prompt—that I was also copying and pasting—into a command that I could call directly from [Claude](https://claude.ai).
    
2.  Once I was confident letting AI fix my typos I wondered what an `editor` could look like. It was tasked with reading every past issue and giving me the notes. What is strong? What needs work? Am I contradicting myself anywhere? A good sparring partner to make me think things through one last time before hitting publish.
    
3.  Around issue 015, I started creating shareable images for social media. `pull-quote` was the next step, it would give me three candidates with the more shareable one-liners from the post for me to choose.
    
4.  I would have second thoughts when making verifiable claims—How many works were there at the Summer exhibition?—so at this point it was quite easy to think of a `fact-checker` skill.
    
5.  At this point, it was quite tedious that last re-read looking for terms that needed links: old issues, names of designers pointing to their profile, organisations that point to their official website, etc. While the first skills took a while to think of, by this point `enrich-hyperlinks` seemed a pretty obvious help to identify the terms and go online to find the actual links.
    
6.  One industry trick: `update-skills`. It will take all the learnings from the review and encode them again in the corresponding skills. AI is constantly changing with companies updating models and context. Your skills should adapt to that too.
    
7.  At the end of the whole process I would end up with a big wall of text in my Claude. I created `issue-summary` that would print a visually distinct table that I could scan more quickly when reviewing my old chats to know what happened there at a glance without getting lost in an old session.
    

Calling these skills one by one is already a gain in efficiency but you are still getting dirty while you walk in the mud. Prompting a lot and trying to remember what’s next. You only need one last skill, one which will walk you through each step in the right order—your orchestrator—and you can stop worrying about how much dirt or water falls on your LLM.
