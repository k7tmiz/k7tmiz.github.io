# ArchLinux安装指南 2025.4.19

## 初步配置

### 联网

 ```dhcpcd/iwctl```

> iwctl:
> device list
> station 'device' scan
> station 'device' get-networks
> station 'device' connect 'wlan'

 #更新ntp服务器 ```timdatectl set-ntp true```

### 分区及挂载

> 此处演示p1:EFI p2:/mnt p3:swap

 #查看目前磁盘，分区状况 ```lsblk```

 #分区 ```fdisk /dev/sdX / fdisk /dev/nvme0n1```

> m 查看命令
> n 新建一个分区
> g 转换GPT
> t 更改分区类型：EFI:1  SWAP:19  Linux:20

 #格式化分区为FAT32格式 ```mkfs.fat -F32 /dev/nvme0n1p1```

 #格式化分区为EXT4格式 ```mkfs.ext4 /dev/nvme0n1p2```

 #格式化分区为SWAP格式 ```mkswap /dev/nvme0n1p3```

 #开启SWAP ```swapon /dev/nvme0n1p3```

 #挂载根分区 ```mount /dev/nvme0n1p2 /mnt```

 #新建Boot文件夹 ```mkdir /mnt/boot```

 #新建Home文件夹 ```mkdir /mnt/home```

 #挂载Boot分区 ```mount /dev/nvme0n1p1 /mnt/boot```

> 如果有的话一个分区为了Home分区 ```mount /dev/nvme0n1px /mnt/home```



## 开始安装

### 编辑镜像源

 ```nano /etc/pacman.d/mirrorlist```

### 拉取镜像

 ```pacstrap /mnt base base-devel linux linux-firmware vi nano```

### 更新分区表

 ```genfstab -U /mnt >> /mnt/etc/fstab```

### 检查分区表

 ```cat /mnt/etc/fstab```

### 下载基本软件

 ```pacman -S vim networkmanager dhcpcd```



## 切换到本地

 ```arch-chroot /mnt```

### 更新本地时间

 ```ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime```

 ```hwclock --systohc```

 #编辑 ``` nano /etc/locale.gen```

 #找到 `en_US.UTF-8` 和 `zh_CN.UTF-8` 去掉前面的#

 #更新 ```locale-gen```

 #编辑locale.conf文件 ```nano /etc/locale.conf````LANG=en_US.UTF-8`

### 设置root密码

 ```passwd```

> 不显示密码是正常情况

### 下载基本软件

 ```pacman -S dialog wpa_supplicant ntfs-3g```

### 安装CPU驱动

 #intel ```pacman -S intel-ucode```

 #amd ```pacman -S amd-ucode```



## 安装引导

 ```pacman -S grub efibootmgr```

 #多系统引导 ```pacman -S os-prober```

 #UEFI引导 ```grub-install --target=x86_64-efi --efi-directory=/boot --bootloader=ArchLinux```

 #更新grub ```grub-mkconfig -o /boot/grub/grub.cfg```



### **至此 安装结束**

 #退出 ```exit```

 #重启 ```reboot```

