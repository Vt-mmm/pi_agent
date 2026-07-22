# Vercel docs site

## Khuyến nghị

Giữ tài liệu HTML trong cùng repository, dưới `docs-site/`.

Production URL hiện tại: https://piagent.io.vn

Vercel project: `pi-agent`

Root Directory: `docs-site`

Lý do:

- Docs đi cùng version của package.
- Review source và docs trong cùng pull request.
- Vercel có thể trỏ Root Directory thẳng vào `docs-site`.
- Không cần build step vì site là static HTML.

Tách repository chỉ nên dùng khi docs cần domain, quyền truy cập, lịch phát hành, hoặc nhóm nội dung riêng với source Pi agent.

## Deploy bằng Dashboard

1. Vào Vercel, chọn Add New Project.
2. Chọn Git repository của Pi Company Platform.
3. Set Root Directory: `docs-site`.
4. Set Framework Preset: `Other`.
5. Build Command: để trống.
6. Output Directory: `.` hoặc để default.
7. Deploy production.

## Deploy bằng CLI

```bash
cd docs-site
vercel --prod
```

Nếu CLI chưa đăng nhập:

```bash
vercel login
```

Sau khi site đã nối Git, các lần sau chỉ cần sửa `docs-site/index.html`, commit và push vào production branch.

## Custom domain

Canonical domain: `piagent.io.vn`

Trong Vercel project `pi-agent` → Settings → Domains, add:

- `piagent.io.vn`
- `www.piagent.io.vn`

Trong iNET DNS, dùng cấu hình do Vercel Domains panel báo. Với cấu hình Vercel phổ biến:

| Type | Name/Host | Value |
|---|---|---|
| `A` | `@` | `76.76.21.21` |
| `CNAME` | `www` | Vercel CNAME target, thường là `cname.vercel-dns-0.com` hoặc giá trị Vercel hiển thị |

Không xoá `MX`, `TXT`, `NS`, hoặc email records nếu domain đang dùng mail. Sau khi DNS valid, Vercel sẽ cấp SSL tự động.

## Local preview

```bash
cd docs-site
python3 -m http.server 4173
```

Mở `http://localhost:4173`.

## Security notes

- Không đặt secret, token, auth file hoặc session cache trong `docs-site/`.
- File `docs-site/vercel.json` chỉ đặt static headers và URL behavior.
- Không cần biến môi trường cho site tĩnh này.
