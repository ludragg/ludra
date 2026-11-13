package account

import "fmt"

type message struct {
	subject string
	body    string
}

var templates = map[string]map[Purpose]message{
	"pt": {
		PurposeVerifyEmail: {
			subject: "Seu código do Ludra: %[2]s",
			body:    "Olá, %[1]s!\n\nSeu código para confirmar o e-mail é:\n\n%[2]s\n\nEle expira em 15 minutos. Se você não criou uma conta no Ludra, ignore este e-mail.\n",
		},
		PurposeResetPassword: {
			subject: "Seu código do Ludra: %[2]s",
			body:    "Olá, %[1]s!\n\nSeu código para redefinir a senha é:\n\n%[2]s\n\nEle expira em 15 minutos. Se você não pediu para redefinir a senha, ignore este e-mail.\n",
		},
		PurposeTwoFactor: {
			subject: "Seu código de acesso do Ludra: %[2]s",
			body:    "Olá, %[1]s!\n\nSeu código para entrar no Ludra é:\n\n%[2]s\n\nEle expira em 15 minutos. Se não foi você que tentou entrar, troque sua senha.\n",
		},
	},
	"en": {
		PurposeVerifyEmail: {
			subject: "Your Ludra code: %[2]s",
			body:    "Hi, %[1]s!\n\nYour code to confirm your email is:\n\n%[2]s\n\nIt expires in 15 minutes. If you didn't create a Ludra account, ignore this email.\n",
		},
		PurposeResetPassword: {
			subject: "Your Ludra code: %[2]s",
			body:    "Hi, %[1]s!\n\nYour code to reset your password is:\n\n%[2]s\n\nIt expires in 15 minutes. If you didn't ask to reset your password, ignore this email.\n",
		},
		PurposeTwoFactor: {
			subject: "Your Ludra sign-in code: %[2]s",
			body:    "Hi, %[1]s!\n\nYour code to sign in to Ludra is:\n\n%[2]s\n\nIt expires in 15 minutes. If it wasn't you trying to sign in, change your password.\n",
		},
	},
}

func codeMessage(purpose Purpose, locale, username, code string) message {
	set, ok := templates[locale]
	if !ok {
		set = templates["pt"]
	}
	t := set[purpose]
	return message{subject: fmt.Sprintf(t.subject, username, code), body: fmt.Sprintf(t.body, username, code)}
}
