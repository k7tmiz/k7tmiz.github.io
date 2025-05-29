---
title: 因上传过大文件而导致hexo部署时Spawn failed报错的解决方法以及注意事项
categories:
  - Tech
abbrlink: 5618ea3e
date: 2025-05-25 19:10:58
tags:
---

之前我发布了一篇[学习计时器](https://k7tmiz.com/posts/f78c38a6.html#more)的文章,当时上传的音频我没注意体积有多大，是在`hexo d`这一步没有成功, warning警告说“GitHub建议上传最大体积为50MB, 上限为100MB”, 很明显我上传的音频文件体积已经超过了100MB. 因此我删掉了那个大文件, 但是当我再次尝试部署时, 还是弹出来一样的warning, 报错文件的路径也和之前的一样, 可是我明明已经删除了那个文件, 后来经过不断的尝试以及在网上搜索, 我找到了一篇和我遇到问题一样的情况[因上传过大文件而导致hexo部署时Spawn failed报错的解决方法以及注意事项](https://ultrafisher.github.io/2020/09/06/%E5%9B%A0%E4%B8%8A%E4%BC%A0%E8%BF%87%E5%A4%A7%E6%96%87%E4%BB%B6%E8%80%8C%E5%AF%BC%E8%87%B4hexo%E9%83%A8%E7%BD%B2%E6%97%B6Spawnfailed%E6%8A%A5%E9%94%99%E7%9A%84%E8%A7%A3%E5%86%B3%E6%96%B9%E6%B3%95%E4%BB%A5%E5%8F%8A%E6%B3%A8%E6%84%8F%E4%BA%8B%E9%A1%B9/) 这里再在自己的博客上做一个记录：

## 首先恢复仓库文件

```
cd .deploy_git
```

## 然后找到自己的 `commitid`
```
git log
```

## 接着输入命令：
```
git reset --hard `commitid`
```

按理来说应该就没有问题可以正常 `hexo d` 了
