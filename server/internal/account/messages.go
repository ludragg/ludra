package account

import "fmt"

type message struct {
	subject string
	body    string
}

func codeMessage(purpose Purpose, username, code string) message {
	subject := fmt.Sprintf("Seu código do Ludra: %s", code)

	if purpose == PurposeResetPassword {
		return message{subject: subject, body: fmt.Sprintf(
			"Olá, %s!\n\nSeu código para redefinir a senha é:\n\n%s\n\nEle expira em 15 minutos. Se você não pediu para redefinir a senha, ignore este e-mail.\n",
			username, code,
		)}
	}

	return message{subject: subject, body: fmt.Sprintf(
		"Olá, %s!\n\nSeu código para confirmar o e-mail é:\n\n%s\n\nEle expira em 15 minutos. Se você não criou uma conta no Ludra, ignore este e-mail.\n",
		username, code,
	)}
}
